# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build (standalone output)
npm run start        # Start production server
npm run lint         # ESLint
npx drizzle-kit generate   # Generate DB migration from schema changes
npx drizzle-kit migrate    # Apply pending migrations
npx drizzle-kit push       # Push schema directly (skip migration files)
```

No test framework is configured.

## Architecture

PLDT Fandom Tracker is a Next.js 16 App Router application for tracking Philippine social media fandoms across 6 platforms (Instagram, TikTok, Facebook, YouTube, Twitter, Reddit) plus Google Trends. It serves as a marketing intelligence dashboard for PLDT Home campaigns.

### Stack

- **Next.js 16** (App Router, React 19, standalone output for Docker)
- **PostgreSQL** via `postgres` driver + **Drizzle ORM**
- **shadcn/ui** (New York style, Radix primitives, Tailwind CSS 4)
- **Apify** for web scraping (7 actor configs in `src/lib/apify/actors.ts`)
- **Recharts** for time-series charts
- **Deployed on Coolify/Hetzner** (not Vercel)

### Data Pipeline

Data collection has two triggers that share the same pipeline:

- **Automated**: A cron job on the Hetzner server hits `GET /api/cron/scrape` every 12 hours (300s timeout). Auth-gated via `Authorization: Bearer <CRON_SECRET>` header. Runs synchronously and returns a summary.
- **Manual**: The Settings page has "Scrape All Fandoms" and per-fandom dropdown buttons. These call `POST /api/scrape/batch` which returns 202 immediately and uses `after()` from `next/server` to run in the background.

Both paths flow through:

```
Trigger (cron GET or manual POST)
  -> scrape.service.ts (orchestration with rate-limit delays)
    -> apify/client.ts runActor() (blocking call to Apify, waits for completion)
      -> apify/normalize.ts (platform-specific field mapping)
        -> ingest.service.ts (deduplicate + upsert)
          -> DB inserts (content_items, metric_snapshots, influencers, google_trends)
```

#### Scrape Orchestration (`scrape.service.ts`)

- `scrapeAllFandoms()` -- loops through all fandoms sequentially (5s delay between fandoms)
- `scrapeAllPlatformsForFandom(fandomId)` -- loops through configured platforms for one fandom (2s delay between platforms)
- `scrapeFandomPlatform(fandomId, platform)` -- single fandom-platform scrape:
  1. Looks up platform handle from `fandom_platforms` table
  2. Builds actor input via `actorConfigs[platform].buildInput(handle)`
  3. Runs Apify actor via blocking `runActor()` call, waits for completion
  4. Logs `scrape_runs` audit record
  5. Passes `datasetId` to `ingestDataset()`

#### Ingestion (`ingest.service.ts`)

`ingestDataset()` processes a completed Apify dataset:

1. Fetches raw items from Apify via `getDatasetItems(datasetId)`
2. **Google Trends special case**: routes to `ingestGoogleTrends()` and returns early
3. Normalizes content via `normalizeContent(platform, rawItems)` -- maps platform-specific fields (e.g., Instagram `likesCount` / TikTok `diggCount` -> `likes`)
4. Upserts content items -- deduplicates by `(fandomId, externalId)`
5. Inserts daily metric snapshot -- one row per fandom/platform/date with followers, engagement totals, averages
6. Updates `fandom_platforms.followers` with latest count
7. Extracts influencers with >1k followers via `normalizeInfluencers()`, upserts by `(fandomId, username)`
8. Runs `analyzeScrapeBatch()` from discovery service -- scans hashtags for new fandom candidates
9. Updates `scrape_runs` audit log with final status and item counts

#### Normalization (`apify/normalize.ts`)

Three functions map platform-specific raw data to unified schemas:
- `normalizeMetrics(platform, rawData)` -- aggregates followers, engagement totals, averages
- `normalizeContent(platform, rawData)` -- maps individual posts/videos to `ContentItem` shape
- `normalizeInfluencers(platform, rawData)` -- extracts creator profiles from content items

#### Apify Actors (`apify/actors.ts`)

7 configured actors with platform-specific input builders:
- Instagram (`apify/instagram-scraper`, 100 posts)
- TikTok (`clockworks/tiktok-scraper`, 100 videos)
- Facebook (`apify/facebook-posts-scraper`, 100 posts)
- YouTube (`streamers/youtube-scraper`, 50 videos)
- Twitter (`apidojo/tweet-scraper`, 500 tweets)
- Reddit (`trudax/reddit-scraper`, 100 posts)
- Google Trends (`apify/google-trends-scraper`, geo="PH")

### Service Layer (`src/lib/services/`)

- **fandom.service.ts** -- Main query layer. `getAllFandoms()` runs parallel DB queries and aggregates metrics, content, influencers. `getFandomBySlug()` returns full detail with top 20 content items and influencers sorted by relevance. Both support date range filtering via `dateFrom`/`dateTo` params. `getRecommendations()` scores fandoms on a 100-point scale (engagement 40pts + growth 30pts + volume 30pts).
- **scrape.service.ts** -- Orchestrates scraping with rate-limit delays. Three levels: `scrapeFandomPlatform()`, `scrapeAllPlatformsForFandom()`, `scrapeAllFandoms()`.
- **ingest.service.ts** -- Normalizes Apify results and upserts into DB. Handles Google Trends separately. Updates `scrape_runs` audit trail. Triggers discovery analysis.
- **discovery.service.ts** -- `analyzeScrapeBatch()` scans hashtags per batch during ingestion. `discoverFandoms()` runs full analysis across last 1000 content items with confidence scoring (frequency + engagement + platform breadth + indicator bonus).

### Database Schema (`src/lib/db/schema.ts`)

8 tables: `fandoms` (core entity), `fandom_platforms` (platform handles + follower counts), `metric_snapshots` (daily time-series per fandom/platform), `content_items` (posts/videos deduplicated by externalId), `influencers` (creators >1k followers), `google_trends` (search interest data), `scrape_runs` (audit log), plus discovery candidates.

Key enums: `tier` (emerging/trending/existing), `platform` (instagram/tiktok/facebook/youtube/twitter/reddit), `demographic` (gen_y/gen_z/abc/cde), `segment` (postpaid=ABC, prepaid=CDE).

### Dashboard Pages

- **Overview** (`/overview`) -- fetches `/api/fandoms`, filters client-side by segment, renders KPI cards + tier-grouped fandom lists
- **Fandom Detail** (`/fandoms/[slug]`) -- fetches `/api/fandoms/[slug]`, renders three tabs: metric charts (Recharts), content table (top 20 by likes), influencer grid (sorted by relevance)
- **Settings** (`/settings`) -- manual scrape controls, scrape activity audit table

### Client-Side Context Providers

- **SegmentContext** (`src/lib/context/segment-context.tsx`) -- Market segment filter (postpaid/prepaid/all)
- **DateRangeContext** (`src/lib/context/date-range-context.tsx`) -- Date presets (7d/30d/90d/1y/all)

Both wrap the dashboard layout and are consumed by pages to filter API queries.

### API Routes (`src/app/api/`)

All dynamic routes use `export const dynamic = "force-dynamic"`. Background work uses `after()` from `next/server` (Next.js 16 feature) to run after response is sent.

Key routes:
- `GET /api/fandoms` -- list all fandoms with aggregated metrics (`?from=&to=`)
- `GET /api/fandoms/[slug]` -- single fandom detail with content + influencers
- `POST /api/fandoms` -- create fandom with platform handles
- `DELETE /api/fandoms?slug=` -- delete fandom and platform entries
- `POST /api/scrape/batch` -- trigger manual scrape (returns 202, background via `after()`)
- `GET /api/scrape/status` -- scrape run audit log (last 50 runs)
- `GET /api/cron/scrape` -- cron-triggered scrape (Bearer auth required, 300s timeout)
- `POST /api/ingest` -- direct ingest from Apify dataset

## Conventions

- Always use SVG icons instead of emoji icons
- UI components live in `src/components/ui/` (shadcn/ui generated)
- Custom dashboard components in `src/components/dashboard/`
- Types defined in `src/types/fandom.ts`
- Path alias: `@/*` maps to `src/*`

## Environment Variables

```
DATABASE_URL          # PostgreSQL connection string
APIFY_TOKEN           # Apify API token for web scraping
OPENAI_API_KEY        # OpenAI API key for AI-generated fandom insights (optional, falls back to rule-based)
CRON_SECRET           # Bearer token for cron endpoint auth (used by Hetzner cron job)
NEXTAUTH_SECRET       # NextAuth secret (auth not yet implemented)
NEXTAUTH_URL          # App URL (https://pldt-fandom.aiailabs.net)
```
