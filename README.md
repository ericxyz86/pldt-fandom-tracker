# PLDT Fandom Tracker

A marketing intelligence dashboard for tracking Philippine social media fandoms across Instagram, TikTok, Facebook, YouTube, Twitter, and Reddit, plus Google Trends. Built for PLDT Home campaigns targeting specific demographic segments (ABC Postpaid / CDE Prepaid).

## Stack

- **Next.js 16** (App Router, React 19, standalone output)
- **PostgreSQL** + **Drizzle ORM**
- **Apify** for web scraping (7 platform actors)
- **shadcn/ui** + **Tailwind CSS 4** + **Recharts**
- **Deployed on Coolify/Hetzner**

## Getting Started

```bash
npm install
cp .env.example .env.local   # Configure environment variables
npm run dev                   # http://localhost:3000
```

### Environment Variables

```
DATABASE_URL          # PostgreSQL connection string
APIFY_TOKEN           # Apify API token for web scraping
CRON_SECRET           # Bearer token for automated cron endpoint auth
NEXTAUTH_SECRET       # NextAuth secret
NEXTAUTH_URL          # App URL (e.g., https://pldt-fandom.aiailabs.net)
```

### Database Setup

```bash
npx drizzle-kit push       # Push schema to database
# or
npx drizzle-kit generate   # Generate migration files
npx drizzle-kit migrate    # Apply migrations
```

## Data Pipeline

The app scrapes social media data via Apify actors and ingests it into PostgreSQL. Both automated and manual triggers use the same pipeline:

```
Trigger (cron GET or manual POST)
  -> scrape.service.ts (orchestration, rate-limited)
    -> apify/client.ts runActor() (blocking call, waits for completion)
      -> apify/normalize.ts (platform-specific field mapping)
        -> ingest.service.ts (deduplicate + upsert)
          -> DB (content_items, metric_snapshots, influencers, google_trends)
```

### Automated Scraping (Cron)

A cron job on the Hetzner server hits `GET /api/cron/scrape` every 12 hours (300s timeout). This endpoint:

1. Validates the `Authorization: Bearer <CRON_SECRET>` header
2. Calls `scrapeAllFandoms()` which loops through all fandoms sequentially (5s delay between fandoms)
3. For each fandom, `scrapeAllPlatformsForFandom()` loops through configured platforms (2s delay between platforms)
4. Each fandom-platform pair calls `scrapeFandomPlatform()` which runs the Apify actor with a **blocking `.call()`** and waits for results
5. Returns a summary with success/failure counts

To set up the cron job on the server:

```bash
# Add to crontab -e
0 */12 * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://pldt-fandom.aiailabs.net/api/cron/scrape
```

Or configure it as a scheduled task in Coolify's UI.

### Manual Scraping

The Settings page (`/settings`) provides manual scrape controls:

- **Scrape All Fandoms** button -- triggers all fandoms across all platforms
- **Per-fandom dropdown** -- scrape a specific fandom's platforms

Manual scrapes call `POST /api/scrape/batch` which returns `202 Accepted` immediately and uses Next.js `after()` to run the work in the background. Progress is visible in the Scrape Activity table on the Settings page.

### What Happens Per Fandom-Platform Scrape

Each `scrapeFandomPlatform()` call:

1. Looks up the platform handle from `fandom_platforms` table
2. Builds actor-specific input via `actorConfigs[platform].buildInput(handle)`
3. Calls `runActor(actorId, input)` -- **blocking**, waits for Apify actor completion
4. Logs a `scrape_runs` record for audit
5. Passes the `datasetId` to `ingestDataset()`

### Ingestion Process

`ingestDataset()` in `ingest.service.ts` performs these steps:

1. **Fetch raw data** from Apify dataset via `getDatasetItems(datasetId)`
2. **Google Trends special case** -- if the actor is `apify/google-trends-scraper`, routes to `ingestGoogleTrends()` and returns early
3. **Normalize & upsert content items** -- maps platform-specific fields (e.g., Instagram `likesCount` / TikTok `diggCount` -> `likes`) and inserts new items, skipping duplicates by `(fandomId, externalId)`
4. **Insert daily metric snapshot** -- one row per fandom/platform/date with followers, engagement totals, and averages
5. **Update follower count** on `fandom_platforms` record
6. **Extract influencers** -- creators with >1k followers are upserted into `influencers` table
7. **Discovery analysis** -- scans hashtags for potential new fandoms to track
8. **Update scrape_runs** audit log with final status and item counts

### Apify Actor Configs

| Platform   | Actor ID                        | Limit |
|------------|---------------------------------|-------|
| Instagram  | `apify/instagram-scraper`       | 100   |
| TikTok     | `clockworks/tiktok-scraper`     | 100   |
| Facebook   | `apify/facebook-posts-scraper`  | 100   |
| YouTube    | `streamers/youtube-scraper`     | 50    |
| Twitter    | `apidojo/tweet-scraper`         | 500   |
| Reddit     | `trudax/reddit-scraper`         | 100   |
| Google Trends | `apify/google-trends-scraper` | --   |

### Data Deduplication

- **Content items** are upserted by `(fandomId, externalId)` -- no duplicates
- **Metric snapshots** store one row per fandom/platform/date combination
- **Influencers** are upserted by `(fandomId, username)` -- only new entries added

## Dashboard

### Overview Page (`/overview`)

Fetches `/api/fandoms?from=...&to=...` and filters client-side by market segment (postpaid/prepaid/all) via `SegmentContext`. Renders KPI cards and fandoms grouped by tier (emerging/trending/existing).

### Fandom Detail Page (`/fandoms/[slug]`)

Fetches `/api/fandoms/[slug]?from=...&to=...` and renders three tabs:

- **Metrics** -- time-series engagement and growth charts (Recharts), platform follower breakdown
- **Content** -- top 20 posts/videos sorted by likes
- **Influencers** -- creator cards sorted by relevance score

### Client-Side Filters

- **SegmentContext** -- market segment (postpaid / prepaid / all)
- **DateRangeContext** -- date presets (7d / 30d / 90d / 1y / all)

Both wrap the dashboard layout and pass filters to API queries.

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fandoms` | List all fandoms with aggregated metrics (supports `?from=&to=`) |
| GET | `/api/fandoms/[slug]` | Single fandom detail with content + influencers |
| POST | `/api/fandoms` | Create a new fandom with platform handles |
| DELETE | `/api/fandoms?slug=` | Delete a fandom and its platform entries |
| POST | `/api/scrape/batch` | Trigger manual scrape (returns 202, runs in background) |
| GET | `/api/scrape/status` | Scrape run audit log (last 50 runs) |
| GET | `/api/cron/scrape` | Cron-triggered scrape (Bearer auth required) |
| POST | `/api/ingest` | Direct ingest from Apify dataset |

## Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm run start        # Production server
npm run lint         # ESLint
```
