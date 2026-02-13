/**
 * Google Trends Regional Breakdown API
 * Fetches "Interest by Region" data for Philippines provinces/regions
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

export interface RegionalInterest {
  regionCode: string;   // e.g., "PH-NCR", "PH-CAL"
  regionName: string;   // e.g., "National Capital Region", "Calabarzon"
  interestValue: number; // 0-100 (100 = highest interest region)
}

export interface RegionalTrendResult {
  keyword: string;
  geo: string;
  timeRange: string;
  regions: RegionalInterest[];
  error?: string;
}

/**
 * Philippine region code mapping (Google Trends format)
 */
const PH_REGIONS = [
  { code: "PH-NCR", name: "National Capital Region" },
  { code: "PH-CAL", name: "Calabarzon" },
  { code: "PH-CEN", name: "Central Luzon" },
  { code: "PH-07", name: "Central Visayas" },
  { code: "PH-11", name: "Davao Region" },
  { code: "PH-03", name: "Ilocos Region" },
  { code: "PH-10", name: "Northern Mindanao" },
  { code: "PH-05", name: "Bicol Region" },
  { code: "PH-06", name: "Western Visayas" },
  { code: "PH-08", name: "Eastern Visayas" },
  { code: "PH-02", name: "Cagayan Valley" },
  { code: "PH-09", name: "Zamboanga Peninsula" },
  { code: "PH-12", name: "Soccsksargen" },
  { code: "PH-CAR", name: "Cordillera" },
  { code: "PH-13", name: "Caraga" },
  { code: "PH-14", name: "ARMM" },
];

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
 * Fetch regional interest breakdown for a keyword in Philippines.
 * Returns interest levels by province/region (0-100 scale, 100 = highest).
 */
export async function fetchRegionalInterest(
  keyword: string,
  geo = "PH",
  timeRange = "today 3-m"
): Promise<RegionalTrendResult> {
  try {
    const cookies = await getSession(geo);
    await sleep(1500);

    // Step 1: Get the explore token for the keyword
    const comparisonItem = [{ keyword, geo, time: timeRange }];
    const exploreReq = JSON.stringify({
      comparisonItem,
      category: 0,
      property: "",
    });

    const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=-480&req=${encodeURIComponent(exploreReq)}`;
    const explore = await fetchWithCookies(exploreUrl, cookies);

    if (explore.status !== 200) {
      console.log(`[GoogleTrends Regional] Explore returned ${explore.status} for "${keyword}"`);
      return {
        keyword,
        geo,
        timeRange,
        regions: [],
        error: `HTTP ${explore.status}`,
      };
    }

    const widgets = JSON.parse(cleanJson(explore.text)).widgets;
    
    // Find the GEO_MAP widget (contains regional data)
    const geoMapWidget = widgets?.find(
      (w: { id: string }) => w.id === "GEO_MAP"
    );

    if (!geoMapWidget) {
      console.log(`[GoogleTrends Regional] No GEO_MAP widget found for "${keyword}"`);
      return {
        keyword,
        geo,
        timeRange,
        regions: [],
        error: "No regional data available",
      };
    }

    await sleep(2000);

    // Step 2: Fetch the regional breakdown data
    const widgetUrl = `https://trends.google.com/trends/api/widgetdata/comparedgeo?hl=en-US&tz=-480&req=${encodeURIComponent(
      JSON.stringify(geoMapWidget.request)
    )}&token=${encodeURIComponent(geoMapWidget.token)}`;

    const resp = await fetchWithCookies(widgetUrl, cookies);

    if (resp.status !== 200) {
      console.log(`[GoogleTrends Regional] Widget fetch returned ${resp.status}`);
      return {
        keyword,
        geo,
        timeRange,
        regions: [],
        error: `HTTP ${resp.status} on widget`,
      };
    }

    const data = JSON.parse(cleanJson(resp.text));
    const geoMapData = data.default?.geoMapData || [];

    if (geoMapData.length === 0) {
      console.log(`[GoogleTrends Regional] No geoMapData for "${keyword}"`);
      return {
        keyword,
        geo,
        timeRange,
        regions: [],
        error: "No regional data points",
      };
    }

    // Parse the regional data
    // Format: { geoCode: "PH-NCR", geoName: "National Capital Region", value: [85], ... }
    const regions: RegionalInterest[] = geoMapData.map((item: any) => ({
      regionCode: item.geoCode,
      regionName: item.geoName,
      interestValue: Array.isArray(item.value) ? item.value[0] : item.value || 0,
    }));

    // Sort by interest value (highest first)
    regions.sort((a, b) => b.interestValue - a.interestValue);

    console.log(
      `[GoogleTrends Regional] "${keyword}": ${regions.length} regions, top = ${regions[0]?.regionName} (${regions[0]?.interestValue})`
    );

    return {
      keyword,
      geo,
      timeRange,
      regions,
    };
  } catch (e) {
    console.error(
      `[GoogleTrends Regional] Error:`,
      e instanceof Error ? e.message : e
    );
    return {
      keyword,
      geo,
      timeRange,
      regions: [],
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/**
 * Fetch regional interest for multiple keywords (sequential to avoid rate limits).
 */
export async function fetchRegionalInterestBatch(
  keywords: string[],
  geo = "PH",
  timeRange = "today 3-m"
): Promise<RegionalTrendResult[]> {
  const results: RegionalTrendResult[] = [];

  for (let i = 0; i < keywords.length; i++) {
    if (i > 0) {
      // 10s delay between keywords to avoid 429
      await sleep(10000);
    }
    const result = await fetchRegionalInterest(keywords[i], geo, timeRange);
    results.push(result);
  }

  return results;
}
