"""
pipeline.py
───────────
Scrape → Extract → Deduplicate → Persist → Expire stale jobs

Sources:
  - Indeed    (via python-jobspy)
  - LinkedIn  (via python-jobspy)
  - Glassdoor (via python-jobspy + ScraperAPI residential proxy)
  - HN Hiring (Hacker News "Who is Hiring" via Algolia — YC startup jobs)

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


# ─────────────────────────────────────────────────────────────────
# Glassdoor via ScraperAPI
# Free tier: 1000 calls/month, no credit card.
# Sign up at scraperapi.com → copy API key → add as SCRAPERAPI_KEY
# GitHub secret. Without the key, Glassdoor is silently skipped.
# ─────────────────────────────────────────────────────────────────

def _scrape_glassdoor(term: str, loc: str, results: int, hours_old: int) -> list[dict]:
    """
    Run a jobspy Glassdoor query routed through ScraperAPI.
    ScraperAPI rotates residential IPs so Glassdoor can't block us.
    """
    api_key = os.getenv("SCRAPERAPI_KEY", "")
    if not api_key:
        return []

    proxy = f"http://scraperapi:{api_key}@proxy-server.scraperapi.com:8001"
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
        log.warning(f"[glassdoor] '{term}' @ {loc} failed: {e}")
    return []


# ─────────────────────────────────────────────────────────────────
# HN "Who is Hiring" scraper  (replaces broken YC/workatastartup)
# Algolia HN API is free, no auth, returns real startup job posts.
# Many posters are YC-backed companies.
# ─────────────────────────────────────────────────────────────────

_HN_HEADERS = {"User-Agent": "HireNext/1.0 job-aggregator"}

def _scrape_hn_hiring() -> list[dict]:
    """
    1. Find the latest "Ask HN: Who is Hiring?" story via Algolia.
    2. Fetch its comments (each is a job post).
    3. Parse title, company, URL from the text.
    """
    jobs = []
    try:
        # Step 1: find latest "Who is Hiring" story
        search_resp = requests.get(
            "https://hn.algolia.com/api/v1/search",
            params={
                "query":       "Ask HN: Who is hiring?",
                "tags":        "story,ask_hn",
                "hitsPerPage": "1",
            },
            headers=_HN_HEADERS,
            timeout=15,
        )
        search_resp.raise_for_status()
        hits = search_resp.json().get("hits", [])
        if not hits:
            log.warning("[hn] no 'Who is Hiring' story found")
            return []

        story_id    = hits[0]["objectID"]
        story_title = hits[0].get("title", "")
        log.info(f"[hn] found story {story_id}: {story_title}")

        # Step 2: fetch full story with all comments
        item_resp = requests.get(
            f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json",
            headers=_HN_HEADERS,
            timeout=15,
        )
        item_resp.raise_for_status()
        story     = item_resp.json()
        child_ids = story.get("kids", [])[:200]   # top 200 comments

        log.info(f"[hn] fetching {len(child_ids)} job comments...")

        for comment_id in child_ids:
            try:
                c_resp = requests.get(
                    f"https://hacker-news.firebaseio.com/v0/item/{comment_id}.json",
                    headers=_HN_HEADERS,
                    timeout=10,
                )
                c_resp.raise_for_status()
                comment = c_resp.json()

                if comment.get("dead") or comment.get("deleted"):
                    continue

                text = comment.get("text", "") or ""
                # Strip HTML tags for plain-text parsing
                plain = re.sub(r"<[^>]+>", " ", text).strip()

                if len(plain) < 30:
                    continue

                # First line is usually "Company | Role | Location | ..."
                first_line = plain.split("\n")[0][:200]
                parts      = [p.strip() for p in re.split(r"\|", first_line)]

                company = parts[0] if parts else "Unknown"
                title   = parts[1] if len(parts) > 1 else "Software Engineer"
                loc     = parts[2] if len(parts) > 2 else "Remote"

                # Extract a URL from the text
                url_match = re.search(r"https?://\S+", plain)
                job_url   = url_match.group(0).rstrip(".,)>") if url_match else \
                            f"https://news.ycombinator.com/item?id={comment_id}"

                remote = "remote" in plain.lower()

                jobs.append(extract({
                    "title":          title[:120],
                    "company":        company[:100],
                    "location":       loc[:80],
                    "job_url":        job_url,
                    "description":    plain[:3000],
                    "date_posted":    "",
                    "job_type":       "full-time",
                    "source":         "yc",
                    "is_remote":      remote,
                    "work_mode":      "remote" if remote else "onsite",
                    "company_domain": "startup",
                }))
                time.sleep(0.05)   # be nice to HN API
            except Exception:
                continue

        log.info(f"[hn] {len(jobs)} jobs parsed from HN hiring thread")
    except Exception as e:
        log.warning(f"[hn] scraper failed: {e}")

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

    # ── Step 0: Expire jobs older than 48 hours ───────────────────
    expired = expire_old_jobs(hours=48)
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
