#!/usr/bin/env node
/**
 * Google Trends residential IP fallback script.
 * Runs from Mac Mini when Hetzner gets 429'd.
 *
 * Usage:
 *   PLDT_API_URL=https://pldt-fandom.aiailabs.net \
 *   PLDT_API_SECRET=<secret> \
 *   node scripts/fetch-trends.js
 *
 * Uses comparative batch queries (5 per batch) with anchor-based
 * cross-batch normalization and 0-100 final scaling.
 */

const API_URL = process.env.PLDT_API_URL || "http://localhost:3000";
const API_SECRET = process.env.PLDT_API_SECRET;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

if (!API_SECRET) {
  console.error("Missing PLDT_API_SECRET env var");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanJson(text) {
  const idx = text.indexOf("{");
  return idx >= 0 ? text.substring(idx) : text;
}

// ── Keyword simplification ──────────────────────────────────────────
const KEYWORD_MAP = {
  "BINI Blooms": "BINI",
  "BTS ARMY": "BTS",
  "NewJeans Bunnies": "NewJeans",
  "SEVENTEEN CARAT": "SEVENTEEN kpop",
  "KAIA Fans": "KAIA girl group",
  "ALAMAT Fans": "ALAMAT pboy group",
  "G22 Fans": "G22 girl group",
  "VXON - Vixies": "VXON group",
  "YGIG - WeGo": "YGIG group",
  "JMFyang Fans": "JMFyang",
  "AshDres Fans": "AshDres",
  "AlDub Nation": "AlDub",
  "Cup of Joe (Joewahs)": "Cup of Joe band",
  "Team Payaman / Cong TV Universe Fans": "Cong TV",
  "r/DragRacePhilippines": "Drag Race Philippines",
};

function simplifyKeyword(name) {
  if (KEYWORD_MAP[name]) return KEYWORD_MAP[name];
  if (name.includes("SB19")) return "SB19";
  if (name.includes("PLUUS")) return "PLUUS band";
  if (name.includes("MLBB") || name.includes("MPL")) return "MPL Philippines";
  if (name.includes("Roblox")) return "Roblox Philippines";
  if (name.includes("Genshin")) return "Genshin Impact Philippines";
  if (name.includes("Valorant")) return "Valorant Philippines";
  if (name.includes("BookTok")) return "BookTok Philippines";
  if (name.includes("Cosplay")) return "Cosplay Philippines";
  return name
    .split(/[/\\(]/)[0]
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
}

// ── Google Trends fetcher ───────────────────────────────────────────
async function fetchWithCookies(url, cookies = "") {
  const headers = {
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

async function getSession(geo) {
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

async function fetchBatch(keywords, geo, timeRange, cookies, retries = 1) {
  const result = new Map();
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
      console.log(`  ⏳ 429 on explore, waiting 12s...`);
      await sleep(12000);
      explore = await fetchWithCookies(exploreUrl, cookies);
    }
    if (explore.status !== 200) {
      console.log(`  ❌ Explore returned ${explore.status}`);
      for (const kw of keywords) result.set(kw, []);
      return result;
    }

    const widgets = JSON.parse(cleanJson(explore.text)).widgets;
    const tw = widgets?.find((w) => w.id === "TIMESERIES");
    if (!tw) {
      for (const kw of keywords) result.set(kw, []);
      return result;
    }

    await sleep(2000);

    const widgetUrl = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=-480&req=${encodeURIComponent(
      JSON.stringify(tw.request)
    )}&token=${encodeURIComponent(tw.token)}`;
    let resp = await fetchWithCookies(widgetUrl, cookies);

    if (resp.status === 429 && retries > 0) {
      console.log(`  ⏳ 429 on timeline, waiting 12s...`);
      await sleep(12000);
      resp = await fetchWithCookies(widgetUrl, cookies);
    }
    if (resp.status !== 200) {
      for (const kw of keywords) result.set(kw, []);
      return result;
    }

    const timeline =
      JSON.parse(cleanJson(resp.text)).default?.timelineData || [];
    for (let ki = 0; ki < keywords.length; ki++) {
      result.set(
        keywords[ki],
        timeline.map((p) => ({
          date: new Date(parseInt(p.time) * 1000).toISOString().split("T")[0],
          value: p.hasData?.[ki] ? p.value[ki] : 0,
        }))
      );
    }
    console.log(
      `  ✅ [${keywords.join(", ")}]: ${timeline.length} points each`
    );
  } catch (e) {
    console.error(`  ❌ Batch error:`, e.message);
    for (const kw of keywords) result.set(kw, []);
  }
  return result;
}

async function fetchComparative(
  keywords,
  geo = "PH",
  timeRange = "today 3-m"
) {
  const cookies = await getSession(geo);
  await sleep(1500);

  if (keywords.length <= 5) {
    const data = await fetchBatch(keywords, geo, timeRange, cookies);
    return normalizeToHundred(keywords, data);
  }

  // Anchor-based batching
  const preferred = ["BTS", "BINI", "SB19", "SEVENTEEN kpop", "NewJeans"];
  let anchor = keywords.find((k) => preferred.includes(k)) || keywords[0];
  const others = keywords.filter((k) => k !== anchor);
  const firstBatch = [anchor, ...others.slice(0, 4)];
  const firstData = await fetchBatch(firstBatch, geo, timeRange, cookies);

  // Verify anchor has data
  const anchorPts = firstData.get(anchor) || [];
  const anchorTotal = anchorPts.reduce((s, p) => s + p.value, 0);
  if (anchorTotal === 0) {
    for (const kw of firstBatch) {
      const t = (firstData.get(kw) || []).reduce((s, p) => s + p.value, 0);
      if (t > 0) {
        anchor = kw;
        break;
      }
    }
  }

  console.log(
    `  🔗 Anchor: "${anchor}" (total: ${(firstData.get(anchor) || []).reduce((s, p) => s + p.value, 0)})`
  );
  const anchorPoints = firstData.get(anchor) || [];
  const allResults = new Map();
  for (const kw of firstBatch) allResults.set(kw, firstData.get(kw) || []);

  const remaining = others.slice(4);
  for (let i = 0; i < remaining.length; i += 4) {
    await sleep(8000);
    const batch = remaining.slice(i, i + 4);
    const batchData = await fetchBatch(
      [anchor, ...batch],
      geo,
      timeRange,
      cookies
    );
    const batchAnchorPts = batchData.get(anchor) || [];

    for (const kw of batch) {
      const kwPts = batchData.get(kw) || [];
      if (kwPts.length === 0 || batchAnchorPts.length === 0) {
        allResults.set(kw, kwPts);
        continue;
      }
      const anchorMax = Math.max(...anchorPoints.map((p) => p.value), 1);
      const batchAnchorMax = Math.max(
        ...batchAnchorPts.map((p) => p.value),
        1
      );
      const scale = anchorMax / batchAnchorMax;
      allResults.set(
        kw,
        kwPts.map((p) => ({
          date: p.date,
          value: Math.round(p.value * scale),
        }))
      );
    }
  }

  return normalizeToHundred(keywords, allResults);
}

function normalizeToHundred(keywords, dataMap) {
  let globalMax = 0;
  for (const pts of dataMap.values()) {
    for (const p of pts) {
      if (p.value > globalMax) globalMax = p.value;
    }
  }
  return keywords.map((kw) => {
    const pts = dataMap.get(kw) || [];
    return {
      keyword: kw,
      points:
        globalMax > 0
          ? pts.map((p) => ({
              date: p.date,
              value: Math.round((p.value / globalMax) * 100),
            }))
          : pts,
    };
  });
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  let fandoms;

  // Try local file first (bypasses Cloudflare Access)
  const { readFileSync, existsSync } = await import("fs");
  const localFile = new URL("../pldt-fandoms.json", import.meta.url).pathname;
  if (process.env.PLDT_FANDOMS_FILE) {
    console.log(`\n📁 Loading fandoms from ${process.env.PLDT_FANDOMS_FILE}...`);
    fandoms = JSON.parse(readFileSync(process.env.PLDT_FANDOMS_FILE, "utf8"));
  } else {
    console.log(`\n🔍 Fetching fandoms from ${API_URL}...`);
    const fandomsResp = await fetch(`${API_URL}/api/fandoms`, {
      headers: { Authorization: `Bearer ${API_SECRET}` },
    });
    if (!fandomsResp.ok || fandomsResp.headers.get("content-type")?.includes("text/html")) {
      console.error("❌ API returned HTML (Cloudflare Access?). Use PLDT_FANDOMS_FILE=/path/to/fandoms.json");
      process.exit(1);
    }
    fandoms = await fandomsResp.json();
  }
  console.log(`   Found ${fandoms.length} fandoms\n`);

  // Build keyword → fandom slug map
  const kwToSlug = new Map();
  const keywords = [];
  for (const f of fandoms) {
    const kw = simplifyKeyword(f.name);
    kwToSlug.set(kw, f.slug);
    keywords.push(kw);
  }

  console.log(
    `📊 Fetching Google Trends (${keywords.length} keywords, comparative batches)...\n`
  );
  const results = await fetchComparative(keywords);

  // Format for upload
  const trends = results.map((r) => ({
    fandomSlug: kwToSlug.get(r.keyword),
    keyword: r.keyword,
    points: r.points,
  }));

  const withData = trends.filter((t) => t.points.length > 0);
  console.log(
    `\n📤 Uploading ${withData.length} fandoms (${withData.reduce((s, t) => s + t.points.length, 0)} data points) to ${API_URL}...`
  );

  // Try upload — if Cloudflare blocks, save locally for manual upload
  try {
    const uploadResp = await fetch(`${API_URL}/api/scrape/trends/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_SECRET}`,
      },
      body: JSON.stringify({ trends }),
    });

    const contentType = uploadResp.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      throw new Error("Cloudflare Access blocked the upload (got HTML login page)");
    }

    if (uploadResp.ok) {
      const result = await uploadResp.json();
      console.log(`✅ Upload complete:`, result);
    } else {
      console.error(`❌ Upload failed: ${uploadResp.status} ${await uploadResp.text()}`);
    }
  } catch (uploadErr) {
    console.log(`\n⚠️  Direct upload failed: ${uploadErr.message}`);
    console.log(`   Saving to /tmp/trends-upload.json for manual upload via SSH...`);
    const { writeFileSync } = await import("fs");
    writeFileSync("/tmp/trends-upload.json", JSON.stringify({ trends }, null, 2));
    console.log(`\n   To upload manually:\n`);
    console.log(`   ssh -i ~/.ssh/hetzner_coolify deploy@37.27.186.15 "sudo docker exec pldt-fandom-updated node -e '`);
    console.log(`     const fs = require(\"fs\");`);
    console.log(`     // scp /tmp/trends-upload.json to server first, then:`);
    console.log(`     fetch(\"http://127.0.0.1:3000/api/scrape/trends/upload\", {`);
    console.log(`       method: \"POST\",`);
    console.log(`       headers: {\"Content-Type\": \"application/json\", \"Authorization\": \"Bearer <SECRET>\"},`);
    console.log(`       body: fs.readFileSync(\"/tmp/trends-upload.json\")`);
    console.log(`     }).then(r=>r.json()).then(console.log);\n'`);

    // Also try uploading via SSH tunnel automatically
    console.log(`\n   🔄 Trying SSH tunnel upload...`);
    const { execSync } = await import("child_process");
    try {
      writeFileSync("/tmp/trends-upload.json", JSON.stringify({ trends }));
      execSync(`scp -i ~/.ssh/hetzner_coolify /tmp/trends-upload.json deploy@37.27.186.15:/tmp/trends-upload.json`, { timeout: 10000 });
      const result = execSync(`ssh -i ~/.ssh/hetzner_coolify deploy@37.27.186.15 "sudo docker cp /tmp/trends-upload.json pldt-fandom-updated:/tmp/trends-upload.json && sudo docker exec pldt-fandom-updated node -e \\"fetch('http://127.0.0.1:3000/api/scrape/trends/upload',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer ${API_SECRET}'},body:require('fs').readFileSync('/tmp/trends-upload.json')}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d))).catch(e=>console.error(e.message))\\""`, { timeout: 120000 }).toString();
      console.log(`   ✅ SSH tunnel upload result:`, result.trim());
    } catch (sshErr) {
      console.error(`   ❌ SSH tunnel also failed:`, sshErr.message);
      console.log(`\n   📁 Data saved to /tmp/trends-upload.json — upload manually.`);
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
