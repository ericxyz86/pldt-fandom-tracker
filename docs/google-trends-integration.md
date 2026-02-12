# Google Trends Integration — Technical Documentation

## Overview

The PLDT Fandom Tracker fetches Google Trends interest-over-time data for all tracked fandoms using **comparative batch queries**. This provides properly normalized search interest data where all fandoms are on the same 0-100 relative scale — exactly like Google Trends' own charts.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Two Paths                         │
│                                                      │
│  PRIMARY: Settings Button                            │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ Dashboard │───>│ Hetzner  │───>│ Google   │      │
│  │ Settings  │    │ Server   │    │ Trends   │      │
│  │ Button    │    │ (API)    │    │ API      │      │
│  └──────────┘    └──────────┘    └──────────┘      │
│                       │                              │
│                       ▼                              │
│                  ┌──────────┐                        │
│                  │ PostgreSQL│                        │
│                  │ DB        │                        │
│                  └──────────┘                        │
│                       ▲                              │
│  FALLBACK: Mac Mini Script                           │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ Mac Mini │───>│ Google   │───>│ SSH      │      │
│  │ Residential   │ Trends   │    │ Tunnel   │      │
│  │ IP       │    │ API      │    │ Upload   │      │
│  └──────────┘    └──────────┘    └──────────┘      │
└─────────────────────────────────────────────────────┘
```

## Why Two Paths?

Google Trends aggressively rate-limits datacenter IPs. Hetzner's IP gets 429'd after ~5-6 API calls in quick succession, with recovery taking **up to 7 hours**. The Mac Mini residential IP is far less restricted.

| Path | Runs From | Rate Limit Risk | How to Trigger |
|------|-----------|-----------------|----------------|
| Primary | Hetzner (server-side) | High — 429 after heavy use | Settings → "Scrape Google Trends" button |
| Fallback | Mac Mini (residential IP) | Low — residential IPs trusted | `node scripts/fetch-trends.js` |

Both paths produce identical output: comparative batch data with 0-100 normalization.

## How Google Trends Normalization Works

### The Problem with Individual Queries

If you query "BTS" alone, Google returns 0-100 where BTS's own peak = 100. If you then query "BINI" alone, BINI's peak is also 100. **These values are incomparable** — BTS might have 100x more actual search volume than BINI but both show 100.

### Comparative Batch Queries (Our Solution)

When you query multiple keywords together (e.g., "BTS" + "BINI" + "SB19"), Google normalizes them **relative to each other**:
- The single highest data point across all keywords and all dates = **100**
- Everything else is proportionally scaled

Google's internal API allows **up to 5 keywords per comparison** (despite the web UI showing 8 — the API returns 400 for >5).

### Cross-Batch Normalization

With 23 fandoms and a limit of 5 per batch, we need 6 batches. To make all batches comparable:

1. **Pick an anchor keyword** (preferably the most popular: BTS, BINI, or SB19)
2. **Include the anchor in every batch**
3. **Calculate scale factors**: If the anchor peaked at 80 in batch 1 but 40 in batch 2, the scale factor for batch 2 is 80/40 = 2.0x
4. **Apply scaling** to all keywords in each batch
5. **Final normalization**: Find the global maximum across all scaled values, divide everything by it, multiply by 100

Result: All 23 fandoms on a single 0-100 scale, highest peak = exactly 100.

## Keyword Disambiguation

Raw fandom names are often too specific or ambiguous for Google Trends:

| Fandom Name | Problem | Search Keyword |
|---|---|---|
| BINI Blooms | Too specific | **BINI** |
| BTS ARMY | Fandom name, not group | **BTS** |
| SEVENTEEN CARAT | "SEVENTEEN" = the number | **SEVENTEEN kpop** |
| ALAMAT Fans | "ALAMAT" = "address" in Filipino | **ALAMAT pboy group** |
| KAIA Fans | "KAIA" = common name | **KAIA girl group** |
| G22 Fans | "G22" = gun model | **G22 girl group** |
| SB19 A'TIN | Apostrophe + fandom name | **SB19** |
| NewJeans Bunnies | Fandom name, not group | **NewJeans** |
| Team Payaman / Cong TV... | Too long | **Cong TV** |
| r/DragRacePhilippines | Reddit-style prefix | **Drag Race Philippines** |
| MLBB / MPL Philippines... | Ambiguous acronym | **MPL Philippines** |

The `simplifyKeyword()` function handles this mapping. It exists in both:
- `src/lib/services/scrape.service.ts` (server-side)
- `scripts/fetch-trends.js` (Mac Mini fallback)

**Important:** When adding new fandoms, update the keyword mapping in both files.

## File Reference

### Core Files

| File | Purpose |
|---|---|
| `src/lib/google-trends/client.ts` | Google Trends API client with cookie management, batch fetching, cross-batch normalization, 0-100 scaling |
| `src/lib/services/scrape.service.ts` | `scrapeGoogleTrends()` function — orchestrates fetch → simplify → batch → normalize → DB insert |
| `src/app/api/scrape/trends/route.ts` | POST endpoint triggered by Settings button |
| `src/app/api/scrape/trends/upload/route.ts` | POST endpoint for external data upload (Mac Mini script) |
| `scripts/fetch-trends.js` | Standalone Node.js script for residential IP fallback |

### Supporting Files

| File | Purpose |
|---|---|
| `src/app/(dashboard)/settings/page.tsx` | "Scrape Google Trends" button UI |
| `src/app/(dashboard)/trends/page.tsx` | Trends visualization page with line charts |
| `src/components/dashboard/trends-upload.tsx` | Drag-and-drop CSV upload component (manual fallback) |
| `src/app/api/trends/upload/route.ts` | CSV file upload endpoint (Google Trends export format) |
| `src/lib/db/schema.ts` | `google_trends` table schema |

### Database Schema

```sql
CREATE TABLE google_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fandom_id UUID NOT NULL REFERENCES fandoms(id),
  keyword TEXT NOT NULL,
  date TEXT NOT NULL,          -- "YYYY-MM-DD"
  interest_value INTEGER NOT NULL,  -- 0-100 normalized
  region TEXT DEFAULT 'PH',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## API Reference

### POST /api/scrape/trends

Triggers server-side Google Trends scrape.

**Auth:** Bearer token (API_SECRET)

**Response:**
```json
{
  "total": 23,
  "succeeded": 23,
  "failed": 0,
  "results": [
    { "fandom": "BTS ARMY", "keyword": "BTS", "dataPoints": 93 },
    { "fandom": "BINI Blooms", "keyword": "BINI", "dataPoints": 93 }
  ]
}
```

### POST /api/scrape/trends/upload

Receives pre-fetched Google Trends data (from Mac Mini script or other sources).

**Auth:** Bearer token (API_SECRET or CRON_SECRET)

**Request Body:**
```json
{
  "trends": [
    {
      "fandomSlug": "bts-army",
      "keyword": "BTS",
      "points": [
        { "date": "2025-11-12", "value": 45 },
        { "date": "2025-11-19", "value": 100 }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "total": 23,
  "succeeded": 23,
  "failed": 0,
  "totalInserted": 2139,
  "results": [...]
}
```

### POST /api/trends/upload (CSV)

Accepts Google Trends CSV export files via multipart form upload. Drag-and-drop UI on `/trends` page.

## Google Trends Internal API Details

### Endpoints Used

1. **Session:** `GET https://trends.google.com/trends/?geo=PH` → sets session cookies
2. **Explore:** `GET /trends/api/explore?req={comparisonItem:[...]}` → returns widget tokens
3. **Timeline:** `GET /trends/api/widgetdata/multiline?req={...}&token={...}` → returns actual data

### Cookie Requirements

- **CONSENT cookie:** `CONSENT=PENDING+999` — bypasses EU/GDPR consent page
- **SOCS cookie:** `SOCS=CAISNQgD...` — additional consent bypass
- **NID cookie:** Set automatically by Google on first visit

### Response Format

Google prepends `)]}'` before JSON in all API responses. Must strip with:
```javascript
const json = text.substring(text.indexOf('{'));
```

### Rate Limiting

- **429 response** = rate limited
- **Recovery time:** 15-30 minutes for light use, **up to 7+ hours** for aggressive scraping from datacenter IPs
- **Mitigation:** 8-second delay between batches, 12-second wait + retry on 429, 2-second delay between explore and timeline calls
- **Residential IPs** (Mac Mini) are far less restricted

## Usage Guide

### Primary: Settings Button

1. Navigate to Settings page on the dashboard
2. Click "Scrape Google Trends"
3. Wait ~2 minutes (6 batches × ~15 seconds each + delays)
4. Check `/trends` page for updated charts

### Fallback: Mac Mini Script

```bash
cd /path/to/pldt-fandom-tracker

PLDT_API_URL=https://pldt-fandom.aiailabs.net \
PLDT_API_SECRET=<your-api-secret> \
PLDT_FANDOMS_FILE=/tmp/pldt-fandoms.json \
node scripts/fetch-trends.js
```

**Getting the fandoms file:**
```bash
# From inside the Docker container on Hetzner:
ssh deploy@37.27.186.15 "sudo docker exec pldt-fandom-updated node -e '
fetch(\"http://127.0.0.1:3000/api/fandoms\", {
  headers:{\"Authorization\":\"Bearer <SECRET>\"}
}).then(r=>r.json()).then(d=>{
  console.log(JSON.stringify(d.map(f=>({name:f.name,slug:f.slug}))));
})'" > /tmp/pldt-fandoms.json
```

The script will:
1. Load fandoms from the local JSON file
2. Fetch Google Trends data in comparative batches (residential IP)
3. Attempt direct upload to the API
4. If Cloudflare Access blocks it → automatically falls back to SSH tunnel upload

### Emergency: CSV Upload

If both paths fail, you can manually export from Google Trends web UI:
1. Go to https://trends.google.com/trends/explore
2. Add keywords and export CSV
3. Drag-and-drop the CSV file on the `/trends` page upload area

## Cron Schedule

Google Trends data updates weekly (not daily). Monthly scraping is sufficient.

- **1st of every month, 00:00 UTC** — Main Apify scrape (all platforms)
- Google Trends can be triggered manually via Settings button or Mac Mini script

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| All keywords peak at 100 | Individual queries, not comparative | Check `scrapeGoogleTrends()` uses `fetchGoogleTrendsComparative()` |
| 429 from Settings button | Hetzner IP rate-limited | Wait 30+ min, or use Mac Mini fallback script |
| 400 from API | >5 keywords in batch | Ensure batch size ≤ 5 (not 8) |
| Stale data after scrape | Old data not deleted | Clear table: `DELETE FROM google_trends;` then re-scrape |
| BTS shows low, AlDub shows high | Undisambiguated keywords | Check `simplifyKeyword()` returns "SEVENTEEN kpop" not "SEVENTEEN" |
| Upload fails (HTML response) | Cloudflare Access blocks POST | Script auto-falls back to SSH tunnel; or upload from inside container |
| "ALAMAT" at 38 | "ALAMAT" = "address" in Filipino | Use "ALAMAT pboy group" as keyword |

## Git Commit History

| Commit | Description |
|---|---|
| `245f315` | Initial: Google Trends comparative scrape, handle verification, follower edit, CSV upload |
| `eb3ac26` | Attempted 8-keyword batches (reverted) |
| `871bf31` | Reverted to 5-keyword batches (API rejects 8) |
| `2b071c2` | Disambiguated keywords — "SEVENTEEN kpop", "ALAMAT pboy group", etc. |
| `d06937f` | Normalized output to 0-100 scale (peak = 100) |
| `20f324b` | Residential IP fallback script + upload endpoint |
| `6c16cf8` | SSH tunnel fallback for Cloudflare Access bypass |

## Key Lessons Learned

1. **Google Trends API caps at 5 keywords** — despite web UI showing 8, `/api/explore` returns 400 for >5 `comparisonItem` entries
2. **Google Trends 429 recovery takes up to 7 hours** from datacenter IPs — always have a residential IP fallback
3. **Individual queries are useless for comparison** — every keyword peaks at 100 independently
4. **Keyword disambiguation is critical** — generic words like "SEVENTEEN", "ALAMAT", "KAIA" capture irrelevant searches
5. **Google Trends API prepends `)]}'`** — must strip before JSON.parse
6. **Consent cookies are required** — without CONSENT + SOCS cookies, Google serves a GDPR page instead of data
7. **pytrends library is dead** — Google killed all programmatic access via pytrends in 2026
8. **Cloudflare Access blocks API calls** — external uploads need SSH tunnel or internal container access
