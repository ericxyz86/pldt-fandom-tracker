/**
 * Google Trends client — comparative batch queries for proper relative scaling.
 * Queries keywords in groups of 5 (Google's max) with an anchor keyword
 * so all values are normalized relative to each other, not individually.
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanJson(text: string): string {
  const idx = text.indexOf("{");
  return idx >= 0 ? text.substring(idx) : text;
}

async function fetchWithCookies(
  url: string,
  cookies = ""
): Promise<{ status: number; text: string; cookies: string }> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://trends.google.com/trends/explore",
  };
  if (cookies) headers["Cookie"] = cookies;

  const resp = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  const setCookies = resp.headers.getSetCookie?.() || [];
  const newCookies = setCookies.map((c) => c.split(";")[0]).join("; ");
  return { status: resp.status, text: await resp.text(), cookies: newCookies };
}

export interface TrendDataPoint {
  date: string;
  value: number;
}

export interface TrendResult {
  keyword: string;
  geo: string;
  dataPoints: TrendDataPoint[];
  error?: string;
}

/**
 * Establish a Google Trends session and return cookies.
 */
async function getSession(geo: string): Promise<string> {
  const session = await fetchWithCookies(
    `https://trends.google.com/trends/?geo=${geo}`
  );
  let cookies = session.cookies;
  if (!cookies.includes("CONSENT")) {
    cookies +=
      "; CONSENT=PENDING+999; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AxGgJlbiACGgYIgJnPpwY";
  }
  return cookies;
}

/**
 * Fetch comparative Google Trends data for a batch of keywords (max 5).
 * Returns data for all keywords on the same relative scale.
 */
async function fetchBatch(
  keywords: string[],
  geo: string,
  timeRange: string,
  cookies: string,
  retries = 1
): Promise<Map<string, TrendDataPoint[]>> {
  const result = new Map<string, TrendDataPoint[]>();
  if (keywords.length === 0) return result;

  try {
    const comparisonItem = keywords.map((keyword) => ({
      keyword,
      geo,
      time: timeRange,
    }));

    const exploreReq = JSON.stringify({
      comparisonItem,
      category: 0,
      property: "",
    });

    const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=-480&req=${encodeURIComponent(exploreReq)}`;
    let explore = await fetchWithCookies(exploreUrl, cookies);

    if (explore.status === 429 && retries > 0) {
      console.log(`[GoogleTrends] 429 on explore, waiting 12s and retrying...`);
      await sleep(12000);
      explore = await fetchWithCookies(exploreUrl, cookies);
    }

    if (explore.status !== 200) {
      console.log(`[GoogleTrends] Explore returned ${explore.status} for batch [${keywords.join(", ")}]`);
      for (const kw of keywords) result.set(kw, []);
      return result;
    }

    const widgets = JSON.parse(cleanJson(explore.text)).widgets;
    const timeseriesWidget = widgets?.find(
      (w: { id: string }) => w.id === "TIMESERIES"
    );

    if (!timeseriesWidget) {
      for (const kw of keywords) result.set(kw, []);
      return result;
    }

    await sleep(2000);

    const widgetUrl = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=-480&req=${encodeURIComponent(
      JSON.stringify(timeseriesWidget.request)
    )}&token=${encodeURIComponent(timeseriesWidget.token)}`;

    let resp = await fetchWithCookies(widgetUrl, cookies);

    if (resp.status === 429 && retries > 0) {
      console.log(`[GoogleTrends] 429 on timeline, waiting 12s...`);
      await sleep(12000);
      resp = await fetchWithCookies(widgetUrl, cookies);
    }

    if (resp.status !== 200) {
      for (const kw of keywords) result.set(kw, []);
      return result;
    }

    const data = JSON.parse(cleanJson(resp.text));
    const timeline = data.default?.timelineData || [];

    // Each data point has value[] array — one per keyword in the batch
    for (let ki = 0; ki < keywords.length; ki++) {
      const points: TrendDataPoint[] = timeline.map(
        (point: { time: string; value: number[]; hasData: boolean[] }) => ({
          date: new Date(parseInt(point.time) * 1000)
            .toISOString()
            .split("T")[0],
          value: point.hasData?.[ki] ? point.value[ki] : 0,
        })
      );
      result.set(keywords[ki], points);
    }

    console.log(
      `[GoogleTrends] Batch [${keywords.join(", ")}]: ${timeline.length} data points each`
    );
  } catch (e) {
    console.error(
      `[GoogleTrends] Batch error:`,
      e instanceof Error ? e.message : e
    );
    for (const kw of keywords) result.set(kw, []);
  }

  return result;
}

/**
 * Fetch Google Trends data for multiple keywords using comparative batch queries.
 *
 * Strategy:
 * - Sort keywords, pick the most "popular" as anchor (first batch determines this)
 * - Query in batches of 4 + 1 anchor keyword
 * - Anchor keyword appears in every batch so we can normalize across batches
 * - Final values are all on the same relative scale
 */
export async function fetchGoogleTrendsComparative(
  keywords: string[],
  geo = "PH",
  timeRange = "today 3-m"
): Promise<TrendResult[]> {
  if (keywords.length === 0) return [];

  const cookies = await getSession(geo);
  await sleep(1500);

  // If 8 or fewer keywords, single batch — perfect comparison
  if (keywords.length <= 8) {
    const batchData = await fetchBatch(keywords, geo, timeRange, cookies);
    return keywords.map((kw) => ({
      keyword: kw,
      geo,
      dataPoints: batchData.get(kw) || [],
      error: (batchData.get(kw) || []).length === 0 ? "No data" : undefined,
    }));
  }

  // More than 5: use anchor-based batching
  // Use a known high-interest keyword as anchor for normalization
  // BTS and BINI are the most searched fandoms in PH
  const preferredAnchors = ["BTS", "BINI", "SB19", "SEVENTEEN", "NewJeans"];
  let anchorKeyword = keywords.find((k) => preferredAnchors.includes(k)) || keywords[0];

  // First batch: anchor + first 7 other keywords (8 total per batch)
  const otherKeywords = keywords.filter((k) => k !== anchorKeyword);
  const firstBatch = [anchorKeyword, ...otherKeywords.slice(0, 7)];
  const firstData = await fetchBatch(firstBatch, geo, timeRange, cookies);

  // Verify anchor has data, fall back if not
  const anchorPoints = firstData.get(anchorKeyword) || [];
  const anchorTotal = anchorPoints.reduce((sum, p) => sum + p.value, 0);
  if (anchorTotal === 0) {
    // Find any keyword with data from first batch
    for (const kw of firstBatch) {
      const pts = firstData.get(kw) || [];
      const total = pts.reduce((sum, p) => sum + p.value, 0);
      if (total > anchorTotal) {
        anchorKeyword = kw;
        break;
      }
    }
  }

  console.log(`[GoogleTrends] Anchor keyword: "${anchorKeyword}" (total interest: ${anchorPoints.reduce((s, p) => s + p.value, 0)})`);

  // Collect all results — first batch is already done
  const allResults = new Map<string, TrendDataPoint[]>();
  for (const kw of firstBatch) {
    allResults.set(kw, firstData.get(kw) || []);
  }

  // Process remaining keywords in batches of 7 (+ anchor = 8)
  const remaining = otherKeywords.slice(7);
  for (let i = 0; i < remaining.length; i += 7) {
    await sleep(8000); // 8s delay between batches to avoid 429

    const batch = remaining.slice(i, i + 7);
    const batchWithAnchor = [anchorKeyword, ...batch];

    const batchData = await fetchBatch(
      batchWithAnchor,
      geo,
      timeRange,
      cookies
    );

    // Normalize this batch relative to the anchor's first-batch values
    const batchAnchorPoints = batchData.get(anchorKeyword) || [];

    for (const kw of batch) {
      const kwPoints = batchData.get(kw) || [];

      if (kwPoints.length === 0 || batchAnchorPoints.length === 0) {
        allResults.set(kw, kwPoints);
        continue;
      }

      // Cross-batch normalization:
      // In this batch, anchor peaked at batchAnchorMax.
      // In the first batch, anchor peaked at anchorMax.
      // Scale factor = anchorMax / batchAnchorMax
      const anchorMax = Math.max(...anchorPoints.map((p) => p.value), 1);
      const batchAnchorMax = Math.max(
        ...batchAnchorPoints.map((p) => p.value),
        1
      );
      const scaleFactor = anchorMax / batchAnchorMax;

      const normalizedPoints = kwPoints.map((p) => ({
        date: p.date,
        value: Math.round(p.value * scaleFactor),
      }));

      allResults.set(kw, normalizedPoints);
    }
  }

  return keywords.map((kw) => ({
    keyword: kw,
    geo,
    dataPoints: allResults.get(kw) || [],
    error: (allResults.get(kw) || []).length === 0 ? "No data" : undefined,
  }));
}

/**
 * Single-keyword fetch (backwards compatible).
 */
export async function fetchGoogleTrends(
  keyword: string,
  geo = "PH",
  timeRange = "today 3-m"
): Promise<TrendResult> {
  const results = await fetchGoogleTrendsComparative(
    [keyword],
    geo,
    timeRange
  );
  return results[0] || { keyword, geo, dataPoints: [], error: "No result" };
}
