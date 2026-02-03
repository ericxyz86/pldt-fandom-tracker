const postgres = require('postgres');
const fs = require('fs');
const crypto = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

const seedFandoms = [
  { name: "KAIA Fans", slug: "kaia-fans", tier: "emerging", description: "Fast-growing fandom for KAIA, a rising P-Pop girl group.", fandomGroup: "P-Pop", demographicTags: ["gen_z", "abc"], searchQuery: "KAIA" },
  { name: "G22 Fans", slug: "g22-fans", tier: "emerging", description: "Fans of G22, a Filipino girl group known for hip-hop and R&B.", fandomGroup: "P-Pop", demographicTags: ["gen_z", "abc"], searchQuery: "G22 Philippines" },
  { name: "r/DragRacePhilippines", slug: "drag-race-philippines", tier: "emerging", description: "Online community around Drag Race Philippines.", fandomGroup: "Drag Race", demographicTags: ["gen_z", "gen_y", "abc"], searchQuery: "Drag Race Philippines" },
  { name: "BTS ARMY", slug: "bts-army", tier: "trending", description: "One of the largest global fandoms. BTS ARMY PH is extremely active.", fandomGroup: "K-POP", demographicTags: ["gen_z", "gen_y", "abc", "cde"], searchQuery: "BTS Philippines" },
  { name: "NewJeans Bunnies", slug: "newjeans-bunnies", tier: "trending", description: "Rapidly growing fandom hugely popular with Gen Z in PH.", fandomGroup: "K-POP", demographicTags: ["gen_z", "abc"], searchQuery: "NewJeans" },
  { name: "SEVENTEEN CARAT", slug: "seventeen-carat", tier: "trending", description: "Dedicated fandom of SEVENTEEN with strong PH presence.", fandomGroup: "K-POP", demographicTags: ["gen_z", "gen_y", "abc"], searchQuery: "SEVENTEEN Philippines" },
  { name: "AlDub Nation", slug: "aldub-nation", tier: "existing", description: "Iconic Filipino fandom centered around the AlDub love team.", fandomGroup: "Local Entertainment", demographicTags: ["gen_y", "cde"], searchQuery: "AlDub" },
  { name: "SB19 A'TIN", slug: "sb19-atin", tier: "existing", description: "A'TIN is the fandom of SB19, the pioneering Filipino boy group.", fandomGroup: "P-Pop", demographicTags: ["gen_z", "gen_y", "abc", "cde"], searchQuery: "SB19" },
  { name: "BINI Blooms", slug: "bini-blooms", tier: "existing", description: "BINI is one of the most popular P-Pop girl groups in PH.", fandomGroup: "P-Pop", demographicTags: ["gen_z", "abc", "cde"], searchQuery: "BINI" },
  { name: "ALAMAT Fans", slug: "alamat-fans", tier: "existing", description: "Fandom for ALAMAT, a multilingual P-Pop boy group.", fandomGroup: "P-Pop", demographicTags: ["gen_z", "cde"], searchQuery: "Alamat Philippines" },
];

async function main() {
  console.log('Connected to database');

  // Load TikTok data
  const tiktok1 = JSON.parse(fs.readFileSync('2026-02-03_tiktok_fandoms.json', 'utf8'));
  const tiktok2 = JSON.parse(fs.readFileSync('2026-02-03_tiktok_fandoms_batch2.json', 'utf8'));
  const allTiktok = [...tiktok1, ...tiktok2];

  console.log(`Loaded ${allTiktok.length} TikTok records`);

  // Create enums first (drizzle push should have done this, but just in case)
  try {
    await sql`CREATE TYPE fandom_tier AS ENUM ('emerging','trending','existing')`;
  } catch(e) { /* already exists */ }
  try {
    await sql`CREATE TYPE platform AS ENUM ('instagram','tiktok','facebook','youtube','twitter','reddit')`;
  } catch(e) { /* already exists */ }
  try {
    await sql`CREATE TYPE content_type AS ENUM ('post','video','reel','tweet','thread')`;
  } catch(e) { /* already exists */ }
  try {
    await sql`CREATE TYPE scrape_status AS ENUM ('pending','running','succeeded','failed')`;
  } catch(e) { /* already exists */ }

  // Insert fandoms
  for (const f of seedFandoms) {
    const existing = await sql`SELECT id FROM fandoms WHERE slug = ${f.slug}`;
    let fandomId;

    if (existing.length > 0) {
      fandomId = existing[0].id;
      console.log(`Fandom ${f.name} already exists (${fandomId})`);
    } else {
      const result = await sql`
        INSERT INTO fandoms (name, slug, tier, description, fandom_group, demographic_tags)
        VALUES (${f.name}, ${f.slug}, ${f.tier}, ${f.description}, ${f.fandomGroup}, ${f.demographicTags})
        RETURNING id
      `;
      fandomId = result[0].id;
      console.log(`Inserted fandom: ${f.name} (${fandomId})`);
    }

    // Insert TikTok platform entry
    const hasPlatform = await sql`SELECT id FROM fandom_platforms WHERE fandom_id = ${fandomId} AND platform = 'tiktok'`;
    if (hasPlatform.length === 0) {
      // Get follower count from TikTok data
      const fandomTiktok = allTiktok.filter(t => t.searchQuery === f.searchQuery);
      const followers = fandomTiktok.length > 0 && fandomTiktok[0].authorMeta
        ? fandomTiktok[0].authorMeta.fans || 0
        : 0;

      await sql`
        INSERT INTO fandom_platforms (fandom_id, platform, handle, followers, url)
        VALUES (${fandomId}, 'tiktok', ${f.searchQuery}, ${followers}, ${'https://www.tiktok.com/search?q=' + encodeURIComponent(f.searchQuery)})
      `;
    }

    // Insert metric snapshot from TikTok data
    const fandomTiktok = allTiktok.filter(t => t.searchQuery === f.searchQuery);
    if (fandomTiktok.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const hasMetric = await sql`SELECT id FROM metric_snapshots WHERE fandom_id = ${fandomId} AND date = ${today} AND platform = 'tiktok'`;

      if (hasMetric.length === 0) {
        const totalLikes = fandomTiktok.reduce((s, i) => s + (i.diggCount || 0), 0);
        const totalComments = fandomTiktok.reduce((s, i) => s + (i.commentCount || 0), 0);
        const totalShares = fandomTiktok.reduce((s, i) => s + (i.shareCount || 0), 0);
        const totalViews = fandomTiktok.reduce((s, i) => s + (i.playCount || 0), 0);
        const followers = fandomTiktok[0].authorMeta ? fandomTiktok[0].authorMeta.fans || 0 : 0;
        const engRate = followers > 0 ? ((totalLikes + totalComments + totalShares) / followers * 100).toFixed(4) : '0';

        await sql`
          INSERT INTO metric_snapshots (fandom_id, platform, date, followers, posts_count, engagement_total, engagement_rate, growth_rate, avg_likes, avg_comments, avg_shares)
          VALUES (${fandomId}, 'tiktok', ${today}, ${followers}, ${fandomTiktok.length}, ${totalLikes + totalComments + totalShares}, ${engRate}, 0, ${Math.round(totalLikes / fandomTiktok.length)}, ${Math.round(totalComments / fandomTiktok.length)}, ${Math.round(totalShares / fandomTiktok.length)})
        `;
        console.log(`  Metrics: ${totalLikes} likes, ${totalComments} comments, ${totalShares} shares, ${totalViews} views`);
      }
    }

    // Insert content items from TikTok
    for (const item of fandomTiktok.slice(0, 10)) {
      const extId = item.id || '';
      if (!extId) continue;
      const hasContent = await sql`SELECT id FROM content_items WHERE external_id = ${extId} AND platform = 'tiktok'`;
      if (hasContent.length === 0) {
        const hashtags = (item.hashtags || []).map(h => typeof h === 'string' ? h : (h.name || h.title || '')).filter(Boolean);
        await sql`
          INSERT INTO content_items (fandom_id, platform, external_id, content_type, text, url, likes, comments, shares, views, published_at, hashtags)
          VALUES (${fandomId}, 'tiktok', ${extId}, 'video', ${item.text || null}, ${item.webVideoUrl || null}, ${item.diggCount || 0}, ${item.commentCount || 0}, ${item.shareCount || 0}, ${item.playCount || 0}, ${item.createTimeISO || null}, ${hashtags})
        `;
      }
    }
    console.log(`  Inserted up to ${Math.min(fandomTiktok.length, 10)} content items`);
  }

  console.log('\nDone seeding database');
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
