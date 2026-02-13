# Geographic Google Trends Feature

**Shipped:** 2026-02-13  
**Status:** ✅ Production

## Overview

Regional Google Trends tracking identifies where fandoms are geographically strongest across the 17 Philippine regions. This enables PLDT to target regional campaigns based on actual search interest data.

---

## Features

### 1. Regional Data Collection

**Endpoint:** `POST /api/scrape/regional-trends`

Scrapes Google Trends "Interest by Region" (GEO_MAP widget) for each tracked fandom.

**Authentication:**
- Header: `X-API-Secret: <PLDT_API_SECRET>`
- Cloudflare Access bypass policy active for `/api/scrape/*` paths

**Request:**
```json
{
  "fandomIds": ["uuid1", "uuid2"]  // Optional, defaults to all fandoms
}
```

**Response:**
```json
{
  "success": true,
  "fandoms": 5,
  "regions": 170,  // Total data points collected
  "message": "Collected regional data for 5 fandoms (170 data points)"
}
```

**Rate Limiting:**
- 10-second delay between keyword scrapes
- Prevents Google Trends 429 errors
- Auto-trigger safe for production use

---

### 2. Keyword Strategy

Each fandom is scraped with **2 keywords** for better data coverage:

1. **Simplified Artist Name** (e.g., "ALAMAT", "BTS", "SEVENTEEN kpop")
2. **Full Fandom Name** (e.g., "ALAMAT Fans", "BTS ARMY", "SEVENTEEN CARAT")

**Keyword Source Priority:**
1. Existing keywords from `google_trends` table (already disambiguated)
2. Fallback: `extractArtistName()` helper + full fandom name

**Example Mapping:**
```
ALAMAT Fans → ["ALAMAT pboy group", "ALAMAT Fans"]
BTS ARMY → ["BTS", "BTS ARMY"]
SEVENTEEN CARAT → ["SEVENTEEN kpop", "SEVENTEEN CARAT"]
```

---

### 3. Data Storage

**Table:** `google_trends`

**Schema:**
```sql
google_trends (
  id UUID PRIMARY KEY,
  fandom_id UUID REFERENCES fandoms(id),
  keyword TEXT,
  date DATE,
  interest_value INTEGER,  -- 0-100 scale
  region TEXT,             -- e.g., "PH-00" (NCR), "PH-40" (Calabarzon)
  created_at TIMESTAMP
)
```

**Philippine Regions (17 total):**
- `PH-00` — Metro Manila (NCR)
- `PH-01` — Ilocos Region
- `PH-02` — Cagayan Valley
- `PH-03` — Central Luzon
- `PH-05` — Bicol Region
- `PH-06` — Western Visayas
- `PH-07` — Central Visayas
- `PH-08` — Eastern Visayas
- `PH-09` — Zamboanga Peninsula
- `PH-10` — Northern Mindanao
- `PH-11` — Davao Region
- `PH-12` — Soccsksargen
- `PH-13` — Caraga
- `PH-14` — ARMM (defunct)
- `PH-15` — Cordillera (CAR)
- `PH-40` — Calabarzon (Region IV-A)
- `PH-41` — MIMAROPA (Region IV-B)

**Interest Value Scale:**
- `100` = Highest interest region for that keyword
- `0` = No data or insufficient search volume
- Values are **relative** within each keyword's dataset

---

### 4. Query API

**Endpoint:** `GET /api/regional-trends?fandomId={uuid}`

Returns latest regional breakdown for a fandom.

**Response:**
```json
{
  "fandomId": "uuid",
  "fandomName": "BTS ARMY",
  "date": "2026-02-13",
  "datasets": [
    {
      "keyword": "BTS",
      "regions": [
        {
          "regionCode": "PH-00",
          "regionName": "Metro Manila (NCR)",
          "interestValue": 100
        },
        {
          "regionCode": "PH-11",
          "regionName": "Davao Region",
          "interestValue": 83
        },
        {
          "regionCode": "PH-40",
          "regionName": "Calabarzon (Region IV-A)",
          "interestValue": 76
        }
      ]
    },
    {
      "keyword": "BTS ARMY",
      "regions": [ /* ... */ ]
    }
  ]
}
```

---

### 5. Frontend Component

**Location:** `src/components/dashboard/regional-map.tsx`

**Features:**
- Top 10 regions ranked by interest
- Progress bars with heat-mapped colors (red gradient)
- Keyword selector (if multiple datasets)
- Campaign targeting recommendations
- Expandable full region list

**Deduplication Logic:**
- Regions are deduplicated by `regionCode`
- Maximum `interestValue` is taken when duplicates exist
- Prevents React key warnings

**UI Integration:**
- New "Geographic" tab on fandom detail pages
- Auto-selects dataset with highest interest values
- Color scale: 0% (gray) → 100% (deep red)

---

### 6. Auto-Trigger Mechanism

**Location:** `src/lib/services/scrape.service.ts`

Regional trends are **automatically collected** after:
1. ✅ Individual fandom scrapes (`scrapeAllPlatformsForFandom`)
2. ✅ Batch scrapes (`scrapeAllFandoms`)
3. ✅ Google Trends comparative scrapes (`scrapeGoogleTrends`)

**Implementation:**
```typescript
// After scraping completes, trigger regional collection
const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
await fetch(`${baseUrl}/api/scrape/regional-trends`, {
  method: 'POST',
  headers: {
    'X-API-Secret': process.env.PLDT_API_SECRET || '',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ fandomIds: [fandomId] }),
});
```

**Benefits:**
- Zero manual intervention
- New fandoms automatically get regional data
- Consistent with main Google Trends scrape timing

---

## Deployment

### Cloudflare Access Configuration

**Required:** Bypass policy for `/api/scrape/*` paths

**Policy Details:**
- **App:** PLDT Fandom Tracker (`pldt-fandom.aiailabs.net`)
- **Policy Name:** Allow Programmatic API Access
- **Decision:** `non_identity`
- **Include:** All IPs (`0.0.0.0/0`)
- **Precedence:** 2

**Why:** Allows auto-trigger webhooks to work without authentication (endpoint still validates `X-API-Secret` header).

### Environment Variables

```bash
PLDT_API_SECRET=<secret>           # API authentication
NEXT_PUBLIC_APP_URL=<base_url>     # For webhook callbacks
DATABASE_URL=<postgres_connection>
```

---

## Usage Examples

### Manual Collection (All Fandoms)

```bash
curl -X POST https://pldt-fandom.aiailabs.net/api/scrape/regional-trends \
  -H "X-API-Secret: <secret>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Manual Collection (Specific Fandoms)

```bash
curl -X POST https://pldt-fandom.aiailabs.net/api/scrape/regional-trends \
  -H "X-API-Secret: <secret>" \
  -H "Content-Type: application/json" \
  -d '{"fandomIds": ["uuid1", "uuid2", "uuid3"]}'
```

### Query Regional Data

```bash
curl "https://pldt-fandom.aiailabs.net/api/regional-trends?fandomId=<uuid>"
```

---

## Campaign Insights

Regional data enables **geographic targeting** for PLDT Home campaigns:

**Example: BTS ARMY**
- **Top Region:** Metro Manila (100%)
- **Strong in:** Davao Region (83%), Calabarzon (76%)
- **Campaign Recommendation:** Focus fiber ads in NCR, Davao, and Calabarzon; secondary push in Central Luzon (65%)

**Example: SEVENTEEN CARAT**
- **Top Region:** Metro Manila (100%)
- **Strong in:** Calabarzon, Central Luzon
- **Campaign Recommendation:** Watch-party WiFi bundles for NCR + suburban areas

**Example: ALAMAT Fans**
- **Top Region:** Central Visayas (100%)
- **Strong in:** ARMM, Metro Manila
- **Campaign Recommendation:** Regional pride messaging in Visayas + connectivity for local language content creation

---

## Troubleshooting

### Issue: All interest values are 0

**Cause:** Google Trends returned no data for that keyword  
**Fix:** Check if keyword is too specific (e.g., "ALAMAT Fans" → use "ALAMAT" instead)

### Issue: 429 Rate Limit

**Cause:** Too many requests in short time  
**Fix:** Wait 1-2 hours; auto-trigger uses 10s delays to prevent this

### Issue: Duplicate region keys (React warning)

**Cause:** Same region code appears multiple times  
**Fix:** Already handled by deduplication logic in `regional-map.tsx`

### Issue: Only 1 keyword scraped instead of 2

**Cause:** Fandom had no existing Google Trends data when first scraped  
**Fix:** Re-scrape with updated logic (fixed in commit `415eae9`)

---

## Technical Details

### Google Trends API

**Endpoint:** `https://trends.google.com/trends/api/widgetdata/comparedgeo`

**Parameters:**
- `req`: JSON-encoded request (keyword, geo, time range)
- `token`: Widget-specific auth token (from explore response)
- `tz`: Timezone offset

**Response:** JSON with `geoMapData` array containing region codes and interest values.

### Rate Limiting Strategy

1. **Sequential scraping:** One keyword at a time
2. **10-second delay:** Between each keyword
3. **Batch size:** 5 fandoms per batch (avoids Cloudflare 524 timeouts)
4. **Retry logic:** None (429 errors return gracefully)

### Performance

- **Single fandom:** ~20-30 seconds (2 keywords × 10s delay + API time)
- **Batch of 5:** ~2 minutes
- **All 23 fandoms:** ~10-12 minutes (via batches)

---

## Future Enhancements

1. **Historical tracking:** Store daily snapshots, track regional growth over time
2. **Regional campaigns API:** Auto-generate PLDT campaign recommendations per region
3. **Heatmap visualization:** SVG map of Philippines with color-coded regions
4. **Regional leaderboard:** Cross-fandom comparison by region (which fandoms dominate NCR?)
5. **Export to CSV:** Regional data export for client presentations

---

## References

- **Google Trends Docs:** https://trends.google.com/trends/
- **GEO_MAP Widget:** Undocumented API (reverse-engineered from web UI)
- **Philippine Region Codes:** ISO 3166-2:PH
- **Commit History:**
  - `bdc1fcf` — Initial regional feature
  - `f845716` — Auto-trigger mechanism
  - `889e6cc` — Middleware auth fix
  - `de01935` — X-API-Secret support
  - `3e13d88` — Duplicate region deduplication
  - `415eae9` — Artist keyword fallback

---

**Maintained by:** Nox (AI Familiar)  
**Last Updated:** 2026-02-13
