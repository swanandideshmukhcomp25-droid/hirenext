"""
pipeline.py
───────────
Scrape → Extract → Deduplicate → Persist → Expire stale jobs

Sources:
  - Indeed    (via python-jobspy)
  - LinkedIn  (via python-jobspy)
  - Glassdoor (via python-jobspy — may 403 on datacenter IPs)
  - Naukri    (India's #1 job board — custom scraper via their internal API)
  - YC        (Hacker News "Who is Hiring" via Algolia + Firebase HN API)

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

DEFAULT_SOURCES = ["indeed", "linkedin", "glassdoor"]  # glassdoor may 403 on some runs
NAUKRI_TERMS = [
    "software engineer", "full stack developer", "backend developer",
    "frontend developer", "python developer", "react developer",
    "data engineer", "data scientist", "machine learning engineer",
    "devops engineer",
]
NAUKRI_LOCATIONS = ["Bangalore", "Hyderabad", "Mumbai", "Delhi", "Pune"]


# ─────────────────────────────────────────────────────────────────
# Naukri.com scraper — India's #1 job board
# Strategy: scrape public HTML search pages (Google-indexed, cannot
# block all IPs) and extract JSON-LD / embedded script data.
# The internal JSON API (/jobapi/v3/search) blocks datacenter IPs
# with 406, so we use the same pages a browser renders.
# ─────────────────────────────────────────────────────────────────

_NAUKRI_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

_NAUKRI_LOCATION_MAP = {
    "Bangalore": "bangalore", "Hyderabad": "hyderabad", "Mumbai": "mumbai",
    "Delhi": "delhi", "Pune": "pune", "Chennai": "chennai",
    "Noida": "noida", "Gurgaon": "gurgaon",
}

_NAUKRI_HTML_HEADERS = {
    "User-Agent":      _NAUKRI_UA,
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest":  "document",
    "Sec-Fetch-Mode":  "navigate",
    "Sec-Fetch-Site":  "none",
    "Cache-Control":   "max-age=0",
}

def _scrape_naukri(term: str, loc: str, results: int = 20) -> list[dict]:
    """
    Scrape Naukri public HTML search pages and extract embedded JSON-LD job data.
    URL pattern: https://www.naukri.com/{term-slug}-jobs-in-{city}
    """
    jobs = []
    naukri_loc = _NAUKRI_LOCATION_MAP.get(loc, loc.lower())
    term_slug  = term.strip().lower().replace(" ", "-")
    url = f"https://www.naukri.com/{term_slug}-jobs-in-{naukri_loc}"

    try:
        resp = requests.get(url, headers=_NAUKRI_HTML_HEADERS, timeout=20)
        if resp.status_code != 200:
            log.warning(f"[naukri] HTML {resp.status_code} for {url}")
            return []

        html = resp.text

        # ── Extract JSON-LD JobPosting blocks ─────────────────────
        ld_blocks = re.findall(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            html, re.DOTALL | re.IGNORECASE,
        )
        for raw in ld_blocks:
            try:
                data = json.loads(raw.strip())
                # Handle both single object and @graph array
                items = data if isinstance(data, list) else \
                        data.get("@graph", [data])
                for item in items:
                    if item.get("@type") != "JobPosting":
                        continue
                    title   = item.get("title", "") or ""
                    company = (item.get("hiringOrganization") or {}).get("name", "") or ""
                    loc_str = (item.get("jobLocation") or {}).get("address", {})
                    if isinstance(loc_str, dict):
                        loc_str = loc_str.get("addressLocality", loc)
                    desc    = re.sub(r"<[^>]+>", " ", item.get("description", "") or "")
                    job_url = item.get("url", url)
                    skills_raw = item.get("skills", "") or ""
                    skills  = [s.strip() for s in re.split(r"[,;]", skills_raw) if s.strip()] \
                              if isinstance(skills_raw, str) else skills_raw

                    if not title or not company:
                        continue

                    jobs.append(extract({
                        "title":          title,
                        "company":        company,
                        "location":       loc_str if isinstance(loc_str, str) else loc,
                        "job_url":        job_url,
                        "description":    desc[:3000],
                        "date_posted":    item.get("datePosted", ""),
                        "job_type":       "full-time",
                        "source":         "naukri",
                        "skills":         skills,
                        "salary_raw":     str(item.get("baseSalary", "")),
                        "is_remote":      "remote" in desc.lower() or "remote" in title.lower(),
                        "work_mode":      "remote" if "remote" in title.lower() else "onsite",
                        "company_domain": "tech",
                    }))
                    if len(jobs) >= results:
                        break
            except Exception:
                continue

        # ── Fallback: extract from embedded JS state ───────────────
        if not jobs:
            m = re.search(r'"jobDetails"\s*:\s*(\[.*?\])\s*[,}]', html, re.DOTALL)
            if m:
                try:
                    listings = json.loads(m.group(1))
                    for item in listings[:results]:
                        title   = item.get("title", "") or ""
                        company = item.get("companyName", "") or ""
                        job_id  = item.get("jobId", "")
                        job_url = item.get("jdURL") or f"https://www.naukri.com/job-listings-{job_id}"
                        desc    = item.get("jobDescription", "") or ""
                        skills  = [s.get("label", "") for s in item.get("tagsAndSkills", []) if s.get("label")]
                        if not title or not company:
                            continue
                        jobs.append(extract({
                            "title": title, "company": company, "location": loc,
                            "job_url": job_url if job_url.startswith("http") else f"https://www.naukri.com{job_url}",
                            "description": desc[:3000], "date_posted": "",
                            "job_type": "full-time", "source": "naukri",
                            "skills": skills, "salary_raw": "",
                            "is_remote": "remote" in title.lower(),
                            "work_mode": "remote" if "remote" in title.lower() else "onsite",
                            "company_domain": "tech",
                        }))
                except Exception:
                    pass

        log.info(f"[naukri] '{term}' @ {loc} → {len(jobs)} jobs (HTML scrape)")

    except Exception as e:
        log.warning(f"[naukri] '{term}' @ {loc} failed: {e}")
    return jobs


# ─────────────────────────────────────────────────────────────────
# YC / HN "Who is Hiring" scraper
# Fetches the latest monthly HN hiring thread via Algolia + Firebase.
# Relaxed parser captures most comment formats.
# ─────────────────────────────────────────────────────────────────

_HN_HEADERS = {"User-Agent": "HireNext/1.0 job-aggregator"}

def _scrape_hn_hiring() -> list[dict]:
    """
    1. Find latest 'Ask HN: Who is Hiring?' via Algolia.
    2. Fetch all top-level comments (job posts) from Firebase HN API.
    3. Parse with relaxed rules — captures pipe-separated AND free-text formats.
    """
    jobs = []
    try:
        # Step 1: latest hiring story
        resp = requests.get(
            "https://hn.algolia.com/api/v1/search",
            params={"query": "Ask HN: Who is hiring?", "tags": "story,ask_hn", "hitsPerPage": "1"},
            headers=_HN_HEADERS, timeout=15,
        )
        resp.raise_for_status()
        hits = resp.json().get("hits", [])
        if not hits:
            log.warning("[yc] no HN hiring story found"); return []

        story_id = hits[0]["objectID"]
        log.info(f"[yc] HN story {story_id}: {hits[0].get('title','')}")

        # Step 2: all child comment IDs
        story = requests.get(
            f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json",
            headers=_HN_HEADERS, timeout=15,
        ).json()
        child_ids = story.get("kids", [])[:300]
        log.info(f"[yc] fetching {len(child_ids)} comments...")

        for cid in child_ids:
            try:
                c = requests.get(
                    f"https://hacker-news.firebaseio.com/v0/item/{cid}.json",
                    headers=_HN_HEADERS, timeout=10,
                ).json()

                if c.get("dead") or c.get("deleted") or not c.get("text"):
                    continue

                # Strip HTML
                plain = re.sub(r"<[^>]+>", " ", c["text"])
                plain = re.sub(r"&amp;", "&", plain)
                plain = re.sub(r"&lt;",  "<", plain)
                plain = re.sub(r"&gt;",  ">", plain)
                plain = re.sub(r"&#x27;","'", plain)
                plain = plain.strip()

                if len(plain) < 40:
                    continue

                first_line = plain.split("\n")[0].strip()[:300]

                # Format 1: "Company | Role | Location | ..."
                if "|" in first_line:
                    parts   = [p.strip() for p in first_line.split("|")]
                    company = parts[0][:100]
                    title   = parts[1][:120] if len(parts) > 1 else "Software Engineer"
                    loc     = parts[2][:80]  if len(parts) > 2 else "Remote"

                # Format 2: "Company (Location) | Role" or "Company - Role"
                elif " - " in first_line or "(" in first_line:
                    dash_split = re.split(r"\s[-–]\s", first_line, maxsplit=1)
                    company = dash_split[0][:100]
                    title   = dash_split[1][:120] if len(dash_split) > 1 else "Software Engineer"
                    loc_m   = re.search(r"\(([^)]+)\)", first_line)
                    loc     = loc_m.group(1)[:80] if loc_m else "Remote"

                # Format 3: free-text — use whole first line as description
                else:
                    # Try to extract company from bold/first word(s)
                    words   = first_line.split()
                    company = " ".join(words[:3])[:100] if words else "Startup"
                    title   = "Software Engineer"
                    loc     = "Remote"

                # Skip obviously non-job comments
                if len(company) < 2 or company.lower().startswith(("http", "i ", "we ", "our ")):
                    continue

                url_m   = re.search(r"https?://\S+", plain)
                job_url = url_m.group(0).rstrip(".,)>;\"") if url_m else \
                          f"https://news.ycombinator.com/item?id={cid}"
                remote  = bool(re.search(r"\bremote\b", plain, re.I))

                jobs.append(extract({
                    "title":          title,
                    "company":        company,
                    "location":       loc,
                    "job_url":        job_url,
                    "description":    plain[:3000],
                    "date_posted":    "",
                    "job_type":       "full-time",
                    "source":         "yc",
                    "is_remote":      remote,
                    "work_mode":      "remote" if remote else "onsite",
                    "company_domain": "startup",
                }))
                time.sleep(0.03)
            except Exception:
                continue

        log.info(f"[yc] {len(jobs)} jobs parsed from HN thread")
    except Exception as e:
        log.warning(f"[yc] scraper failed: {e}")
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
    start = time.time()

    terms     = search_terms or TECH_SEARCH_TERMS
    locs      = locations    or DEFAULT_LOCATIONS
    site_list = sources      or DEFAULT_SOURCES
    hours_old = int(os.getenv("DEFAULT_HOURS_OLD", 48))
    delay     = float(os.getenv("SCRAPE_DELAY_SECONDS", 1.5))

    # ── Step 0: Expire jobs older than 72 hours ───────────────────
    expired = expire_old_jobs(hours=72)
    log.info(f"[pipeline] Expired {expired} stale jobs (>48h old)")

    main_sources  = site_list   # all sources including glassdoor in one jobspy call
    run_glassdoor = False       # separate glassdoor step not needed — it's in main_sources

    all_raw_jobs:   list[dict] = []
    failed_queries: list[str]  = []
    gd_jobs_total:  int        = 0
    total_queries = len(terms) * len(locs)

    log.info(
        f"[pipeline] START — {len(terms)} terms × {len(locs)} cities"
        f" | main={main_sources} glassdoor={'yes (ScraperAPI)' if run_glassdoor else 'no (no SCRAPERAPI_KEY)'}"
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

    # ── Step 1b: Glassdoor via ScraperAPI ─────────────────────────
    if run_glassdoor:
        log.info("[pipeline] Starting Glassdoor scrape via ScraperAPI...")
        gd_terms = terms[:5]
        gd_locs  = locs[:3]
        for term in gd_terms:
            for loc in gd_locs:
                log.info(f"[glassdoor] '{term}' @ {loc}")
                gd = _scrape_glassdoor(term, loc, results_per_query, hours_old)
                if gd:
                    all_raw_jobs.extend(gd)
                    gd_jobs_total += len(gd)
                    log.info(f"[glassdoor]   → {len(gd)} jobs (gd total: {gd_jobs_total})")
                time.sleep(delay)
        log.info(f"[glassdoor] Done — {gd_jobs_total} total jobs")
    else:
        log.info("[glassdoor] Skipped — add SCRAPERAPI_KEY secret to enable")

    # ── Step 2: HN Who is Hiring (YC startup jobs) ───────────────
    log.info("[pipeline] Scraping HN Who is Hiring (YC startup jobs)...")
    yc_jobs = _scrape_hn_hiring()
    all_raw_jobs.extend(yc_jobs)
    log.info(f"[pipeline] HN/YC added {len(yc_jobs)} jobs (total: {len(all_raw_jobs)})")

    # ── Step 2b: Naukri.com via jobspy built-in scraper ──────────
    naukri_jobs_total = 0
    log.info(f"[naukri] Scraping {len(NAUKRI_TERMS)} terms × {len(NAUKRI_LOCATIONS)} cities via jobspy...")
    for term in NAUKRI_TERMS:
        for loc in NAUKRI_LOCATIONS:
            try:
                df = jobspy_scrape(
                    site_name      = ["naukri"],
                    search_term    = term,
                    location       = loc,
                    results_wanted = 20,
                    hours_old      = hours_old,
                    verbose        = 0,
                )
                if df is not None and not df.empty:
                    cleaned = clean_jobs(df)
                    all_raw_jobs.extend(cleaned)
                    naukri_jobs_total += len(cleaned)
                    log.info(f"[naukri] '{term}' @ {loc} → {len(cleaned)} jobs")
                else:
                    log.info(f"[naukri] '{term}' @ {loc} → 0 jobs")
            except Exception as e:
                log.warning(f"[naukri] '{term}' @ {loc} failed: {e}")
            time.sleep(delay)
    log.info(f"[naukri] Done — {naukri_jobs_total} jobs added (total: {len(all_raw_jobs)})")

    total_scraped = len(all_raw_jobs)
    log.info(f"[pipeline] Scraping done — {total_scraped} raw, {len(failed_queries)} failed queries")

    if total_scraped == 0:
        return {
            "expired": expired, "total_scraped": 0, "total_extracted": 0,
            "inserted": 0, "failed": 0, "errors": [],
            "failed_queries": failed_queries,
            "duration_seconds": round(time.time() - start, 2),
            "queries_run": total_queries,
            "yc_jobs": len(yc_jobs),
            "naukri_jobs": naukri_jobs_total,
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
        "naukri_jobs":      naukri_jobs_total,
        "sources":          site_list + ["yc", "naukri"],
    }
