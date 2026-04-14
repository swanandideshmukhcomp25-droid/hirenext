"""
pipeline.py
───────────
Scrape → Extract → Deduplicate → Persist → Expire stale jobs

Sources:
  - Indeed    (via python-jobspy)
  - LinkedIn  (via python-jobspy)
  - Glassdoor (via python-jobspy + free rotating proxy to bypass 403)
  - YC / Work at a Startup (scrapes __NEXT_DATA__ from page HTML)

Runs every 24 hours via GitHub Actions cron.
"""

import os
import re
import time
import logging
import json
import requests
from jobspy import scrape_jobs as jobspy_scrape

from app.utils.cleaner   import clean_jobs
from app.utils.extractor import extract
from app.db.jobs_repo    import insert_jobs_batch, expire_old_jobs

log = logging.getLogger(__name__)

# ── Search terms covering every major tech role ───────────────────
TECH_SEARCH_TERMS = [
    # Engineering
    "software engineer", "full stack developer",
    "backend developer", "frontend developer", "software developer",
    # Languages
    "python developer", "javascript developer", "java developer",
    "golang developer", "node js developer",
    # Frontend
    "react developer", "angular developer", "vue developer",
    # Data & AI
    "data engineer", "data scientist", "machine learning engineer",
    "ai engineer", "llm engineer",
    # Infrastructure
    "devops engineer", "cloud engineer", "site reliability engineer",
    # Mobile
    "android developer", "ios developer", "react native developer",
    # Speciality
    "qa engineer",
]

# ── Top Indian tech cities ────────────────────────────────────────
DEFAULT_LOCATIONS = [
    "Bangalore", "Hyderabad", "Mumbai",
    "Delhi", "Pune", "Chennai", "Noida", "Gurgaon",
]

DEFAULT_SOURCES = ["indeed", "linkedin", "glassdoor"]


# ─────────────────────────────────────────────────────────────────
# Glassdoor proxy helper
# GitHub Actions IPs are datacenter IPs — Glassdoor 403s them.
# We fetch a fresh free HTTPS proxy from geonode and pass it to jobspy.
# ─────────────────────────────────────────────────────────────────

_glassdoor_proxy: str | None = None

def _get_free_proxy() -> str | None:
    """
    Fetch a fresh HTTPS proxy from geonode's free proxy API.
    Returns 'http://ip:port' or None on failure.
    """
    try:
        url = (
            "https://proxylist.geonode.com/api/proxy-list"
            "?limit=10&page=1&sort_by=lastChecked&sort_type=desc"
            "&protocols=https&anonymityLevel=elite,anonymous"
        )
        resp = requests.get(url, timeout=10)
        data = resp.json()
        proxies = data.get("data", [])
        for p in proxies:
            ip   = p.get("ip")
            port = p.get("port")
            if ip and port:
                proxy = f"http://{ip}:{port}"
                log.info(f"[glassdoor] using proxy: {proxy}")
                return proxy
    except Exception as e:
        log.warning(f"[glassdoor] failed to fetch proxy: {e}")
    return None


def _scrape_glassdoor_with_proxy(
    term: str, loc: str, results: int, hours_old: int
) -> list[dict]:
    """
    Run a single jobspy Glassdoor query through a free proxy.
    Falls back gracefully if proxy fetch or scrape fails.
    """
    global _glassdoor_proxy

    # Refresh proxy once per pipeline run (lazy init)
    if _glassdoor_proxy is None:
        _glassdoor_proxy = _get_free_proxy() or ""

    proxy = _glassdoor_proxy or None

    try:
        df = jobspy_scrape(
            site_name      = ["glassdoor"],
            search_term    = term,
            location       = loc,
            results_wanted = results,
            hours_old      = hours_old,
            country_indeed = "India",
            proxy          = proxy,
            verbose        = 0,
        )
        if df is not None and not df.empty:
            return clean_jobs(df)
    except Exception as e:
        log.warning(f"[glassdoor] '{term}' @ {loc} failed ({e}) — retrying with new proxy")
        # Try once with a fresh proxy
        _glassdoor_proxy = _get_free_proxy() or ""
        try:
            df = jobspy_scrape(
                site_name      = ["glassdoor"],
                search_term    = term,
                location       = loc,
                results_wanted = results,
                hours_old      = hours_old,
                country_indeed = "India",
                proxy          = _glassdoor_proxy or None,
                verbose        = 0,
            )
            if df is not None and not df.empty:
                return clean_jobs(df)
        except Exception as e2:
            log.warning(f"[glassdoor] retry also failed: {e2}")
    return []


# ─────────────────────────────────────────────────────────────────
# YC / Work at a Startup scraper
# Extracts __NEXT_DATA__ JSON embedded in the page (Next.js pattern)
# ─────────────────────────────────────────────────────────────────

_YC_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
}

def _scrape_yc() -> list[dict]:
    """
    Scrape Work at a Startup by extracting __NEXT_DATA__ from the HTML.
    Falls back to a direct API call if the page approach fails.
    """
    jobs = []
    try:
        resp = requests.get(
            "https://www.workatastartup.com/jobs",
            headers=_YC_HEADERS,
            timeout=20,
        )
        resp.raise_for_status()

        # Extract the embedded Next.js JSON payload
        match = re.search(
            r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
            resp.text, re.DOTALL,
        )
        if not match:
            log.warning("[yc] __NEXT_DATA__ not found — trying direct API")
            return _scrape_yc_api()

        page_data  = json.loads(match.group(1))
        page_props = page_data.get("props", {}).get("pageProps", {})

        # The jobs list can live under different keys depending on the page version
        listings = (
            page_props.get("jobs")
            or page_props.get("jobListings")
            or page_props.get("initialJobs")
            or []
        )

        log.info(f"[yc] __NEXT_DATA__ found {len(listings)} raw listings")

        for item in listings:
            company = item.get("company") or {}
            if isinstance(company, str):
                company_name = company
            else:
                company_name = company.get("name", "") or company.get("slug", "")

            title   = item.get("title", "") or item.get("job_title", "") or ""
            job_id  = item.get("id", "")
            job_url = item.get("url", "") or (
                f"https://www.workatastartup.com/jobs/{job_id}" if job_id else ""
            )
            desc    = item.get("description", "") or item.get("body", "") or ""
            loc     = item.get("location", "") or item.get("remote_ok", "") or "Remote"
            remote  = bool(item.get("remote") or item.get("remote_ok") or "remote" in str(loc).lower())

            if not title or not company_name:
                continue

            jobs.append(extract({
                "title":          title,
                "company":        company_name,
                "location":       str(loc),
                "job_url":        job_url,
                "description":    desc[:3000],
                "date_posted":    str(item.get("created_at", "") or item.get("posted_at", ""))[:10],
                "job_type":       "full-time",
                "source":         "yc",
                "is_remote":      remote,
                "work_mode":      "remote" if remote else "onsite",
                "company_domain": "startup",
            }))

        log.info(f"[yc] {len(jobs)} valid jobs extracted")
    except Exception as e:
        log.warning(f"[yc] page scraper failed: {e} — trying API fallback")
        return _scrape_yc_api()

    return jobs


def _scrape_yc_api() -> list[dict]:
    """
    Fallback: call workatastartup.com's internal search API directly.
    """
    jobs = []
    try:
        # Internal API endpoint used by their React frontend
        api_url = "https://www.workatastartup.com/companies/search"
        params  = {
            "hasActiveJob": "true",
            "type":         "full_time",
            "remote":       "only",
        }
        resp = requests.get(api_url, params=params, headers=_YC_HEADERS, timeout=20)
        resp.raise_for_status()
        data     = resp.json()
        companies = data if isinstance(data, list) else data.get("companies", [])

        log.info(f"[yc-api] {len(companies)} companies returned")

        for co in companies[:100]:   # cap at 100 companies
            co_name = co.get("name", "")
            for job in (co.get("jobs") or []):
                title   = job.get("title", "") or ""
                job_id  = job.get("id", "")
                job_url = job.get("url", "") or f"https://www.workatastartup.com/jobs/{job_id}"
                desc    = job.get("description", "") or ""
                loc     = job.get("location", "") or "Remote"
                remote  = bool(job.get("remote") or "remote" in loc.lower())

                if not title:
                    continue

                jobs.append(extract({
                    "title":          title,
                    "company":        co_name,
                    "location":       loc,
                    "job_url":        job_url,
                    "description":    desc[:3000],
                    "date_posted":    "",
                    "job_type":       "full-time",
                    "source":         "yc",
                    "is_remote":      remote,
                    "work_mode":      "remote" if remote else "onsite",
                    "company_domain": "startup",
                }))

        log.info(f"[yc-api] {len(jobs)} jobs extracted")
    except Exception as e:
        log.warning(f"[yc-api] fallback also failed: {e}")

    return jobs


# ─────────────────────────────────────────────────────────────────
# Main pipeline
# ─────────────────────────────────────────────────────────────────

def run_pipeline(
    search_terms:      list[str] | None = None,
    locations:         list[str] | None = None,
    results_per_query: int = 20,
    sources:           list[str] | None = None,
) -> dict:
    """
    Expire stale jobs → Scrape all sources → Extract → Dedupe → Upsert.
    Returns a summary dict.
    """
    global _glassdoor_proxy
    _glassdoor_proxy = None   # reset proxy each pipeline run

    start = time.time()

    terms     = search_terms or TECH_SEARCH_TERMS
    locs      = locations    or DEFAULT_LOCATIONS
    site_list = sources      or DEFAULT_SOURCES
    hours_old = int(os.getenv("DEFAULT_HOURS_OLD", 48))
    delay     = float(os.getenv("SCRAPE_DELAY_SECONDS", 1.5))

    # ── Step 0: Expire jobs older than 48 hours ───────────────────
    expired = expire_old_jobs(hours=48)
    log.info(f"[pipeline] Expired {expired} stale jobs (>48h old)")

    # Separate Glassdoor from the main jobspy batch
    main_sources      = [s for s in site_list if s != "glassdoor"]
    run_glassdoor     = "glassdoor" in site_list

    all_raw_jobs:   list[dict] = []
    failed_queries: list[str]  = []
    gd_jobs_total:  int        = 0
    total_queries = len(terms) * len(locs)

    log.info(
        f"[pipeline] START — {len(terms)} terms × {len(locs)} cities"
        f" | main={main_sources} glassdoor={'yes' if run_glassdoor else 'no'}"
    )

    # ── Step 1a: Indeed + LinkedIn ────────────────────────────────
    for t_idx, term in enumerate(terms, 1):
        for l_idx, loc in enumerate(locs, 1):
            log.info(f"[pipeline] [{t_idx}/{len(terms)}] '{term}' @ {loc}")
            try:
                df = jobspy_scrape(
                    site_name      = main_sources,
                    search_term    = term,
                    location       = loc,
                    results_wanted = results_per_query,
                    hours_old      = hours_old,
                    country_indeed = "India",
                    verbose        = 0,
                )
                if df is not None and not df.empty:
                    cleaned = clean_jobs(df)
                    all_raw_jobs.extend(cleaned)
                    log.info(f"[pipeline]   → {len(cleaned)} jobs (total: {len(all_raw_jobs)})")
                else:
                    log.info(f"[pipeline]   → 0 jobs")
            except Exception as e:
                log.warning(f"[pipeline]   FAILED: {e}")
                failed_queries.append(f"{term}@{loc}")

            time.sleep(delay)

    # ── Step 1b: Glassdoor via proxy ──────────────────────────────
    if run_glassdoor:
        log.info("[pipeline] Starting Glassdoor scrape via proxy...")
        # Only scrape top 5 terms × top 3 cities to keep runtime reasonable
        gd_terms = terms[:5]
        gd_locs  = locs[:3]
        for term in gd_terms:
            for loc in gd_locs:
                log.info(f"[glassdoor] '{term}' @ {loc}")
                gd = _scrape_glassdoor_with_proxy(term, loc, results_per_query, hours_old)
                if gd:
                    all_raw_jobs.extend(gd)
                    gd_jobs_total += len(gd)
                    log.info(f"[glassdoor]   → {len(gd)} jobs (gd total: {gd_jobs_total})")
                time.sleep(delay)
        log.info(f"[glassdoor] Done — {gd_jobs_total} total jobs")

    # ── Step 2: YC / Work at a Startup ───────────────────────────
    log.info("[pipeline] Scraping YC / Work at a Startup...")
    yc_jobs = _scrape_yc()
    all_raw_jobs.extend(yc_jobs)
    log.info(f"[pipeline] YC added {len(yc_jobs)} jobs (total: {len(all_raw_jobs)})")

    total_scraped = len(all_raw_jobs)
    log.info(f"[pipeline] Scraping done — {total_scraped} raw, {len(failed_queries)} failed queries")

    if total_scraped == 0:
        return {
            "expired": expired, "total_scraped": 0, "total_extracted": 0,
            "inserted": 0, "failed": 0, "errors": [],
            "failed_queries": failed_queries,
            "duration_seconds": round(time.time() - start, 2),
            "queries_run": total_queries,
        }

    # ── Step 3: Deduplicate by URL ────────────────────────────────
    seen_urls: set[str] = set()
    unique_jobs = []
    for j in all_raw_jobs:
        url = j.get("job_url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique_jobs.append(j)

    dupes = total_scraped - len(unique_jobs)
    log.info(f"[pipeline] After dedup: {len(unique_jobs)} unique ({dupes} dupes removed)")

    # ── Step 4: Enrich ────────────────────────────────────────────
    enriched_jobs = []
    for job in unique_jobs:
        try:
            enriched_jobs.append(extract(job))
        except Exception as e:
            log.warning(f"[pipeline] Extractor error on '{job.get('title')}': {e}")
            enriched_jobs.append(job)

    log.info(f"[pipeline] Enriched {len(enriched_jobs)} jobs")

    # ── Step 5: Bulk upsert ───────────────────────────────────────
    db_result = insert_jobs_batch(enriched_jobs)
    duration  = round(time.time() - start, 2)

    log.info(f"[pipeline] DONE — inserted={db_result['inserted']} failed={db_result['failed']} time={duration}s")

    return {
        "expired":          expired,
        "total_scraped":    total_scraped,
        "unique_jobs":      len(unique_jobs),
        "total_extracted":  len(enriched_jobs),
        "inserted":         db_result["inserted"],
        "failed":           db_result["failed"],
        "errors":           db_result["errors"][:10],
        "failed_queries":   failed_queries[:20],
        "duration_seconds": duration,
        "queries_run":      total_queries,
        "glassdoor_jobs":   gd_jobs_total,
        "yc_jobs":          len(yc_jobs),
        "sources":          site_list + ["yc"],
    }
