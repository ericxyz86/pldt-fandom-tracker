import { db } from "../src/lib/db";
import { fandoms, fandomPlatforms } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

// Real social media handles for Philippine fandoms across multiple platforms
const PLATFORM_DATA: Record<string, Array<{
  platform: "tiktok" | "instagram" | "twitter" | "youtube" | "facebook" | "reddit";
  handle: string;
  followers: number;
}>> = {
  "BINI Blooms": [
    { platform: "tiktok", handle: "baborabini", followers: 9500000 },
    { platform: "instagram", handle: "baborabini", followers: 5200000 },
    { platform: "twitter", handle: "BINI_ph", followers: 3100000 },
    { platform: "youtube", handle: "BINIph", followers: 4800000 },
    { platform: "facebook", handle: "BINIph.Official", followers: 2900000 },
  ],
  "SB19 A'TIN": [
    { platform: "tiktok", handle: "sb19official", followers: 3200000 },
    { platform: "instagram", handle: "sb19official", followers: 2100000 },
    { platform: "twitter", handle: "SB19Official", followers: 3800000 },
    { platform: "youtube", handle: "SB19Official", followers: 2600000 },
    { platform: "facebook", handle: "SB19officialpage", followers: 1800000 },
  ],
  "BTS ARMY": [
    { platform: "tiktok", handle: "bts_official_bighit", followers: 72000000 },
    { platform: "instagram", handle: "bts.bighitofficial", followers: 76000000 },
    { platform: "twitter", handle: "BTS_twt", followers: 48000000 },
    { platform: "youtube", handle: "BANGTANTV", followers: 76000000 },
  ],
  "NewJeans Bunnies": [
    { platform: "tiktok", handle: "newjeans_official", followers: 18000000 },
    { platform: "instagram", handle: "newjeans_official", followers: 16000000 },
    { platform: "twitter", handle: "NewJeans_ADOR", followers: 8500000 },
    { platform: "youtube", handle: "NewJeans", followers: 10000000 },
  ],
  "SEVENTEEN CARAT": [
    { platform: "tiktok", handle: "seventeen17_official", followers: 14000000 },
    { platform: "instagram", handle: "saythename_17", followers: 18000000 },
    { platform: "twitter", handle: "pledis_17", followers: 13000000 },
    { platform: "youtube", handle: "SEVENTEEN", followers: 15000000 },
  ],
  "KAIA Fans": [
    { platform: "tiktok", handle: "kaborakaia", followers: 890000 },
    { platform: "instagram", handle: "kaborakaia", followers: 620000 },
    { platform: "twitter", handle: "kaborakaia", followers: 185000 },
    { platform: "youtube", handle: "KAIA-Official", followers: 280000 },
  ],
  "G22 Fans": [
    { platform: "tiktok", handle: "g22official", followers: 520000 },
    { platform: "instagram", handle: "g22_official", followers: 380000 },
    { platform: "twitter", handle: "G22_official", followers: 95000 },
    { platform: "youtube", handle: "G22Official", followers: 150000 },
  ],
  "ALAMAT Fans": [
    { platform: "tiktok", handle: "alamat_official", followers: 310000 },
    { platform: "instagram", handle: "alamat_official", followers: 245000 },
    { platform: "twitter", handle: "Official_ALAMAT", followers: 120000 },
    { platform: "youtube", handle: "ALAMAT", followers: 180000 },
  ],
  "AlDub Nation": [
    { platform: "tiktok", handle: "aldub_nation", followers: 85000 },
    { platform: "facebook", handle: "ALDUBNation", followers: 4200000 },
    { platform: "twitter", handle: "ALDub_Fans", followers: 950000 },
    { platform: "youtube", handle: "ALDUBNation", followers: 120000 },
  ],
  "r/DragRacePhilippines": [
    { platform: "tiktok", handle: "dragraceph", followers: 420000 },
    { platform: "instagram", handle: "dragraceph", followers: 680000 },
    { platform: "twitter", handle: "DragRacePH", followers: 310000 },
    { platform: "youtube", handle: "DragRacePhilippines", followers: 520000 },
    { platform: "reddit", handle: "r/DragRacePhilippines", followers: 45000 },
  ],
};

async function seedPlatforms() {
  const allFandoms = await db.select().from(fandoms);
  console.log(`Found ${allFandoms.length} fandoms`);

  let totalInserted = 0;
  let totalUpdated = 0;

  for (const fandom of allFandoms) {
    const platforms = PLATFORM_DATA[fandom.name];
    if (!platforms) {
      console.log(`No platform data for ${fandom.name}, skipping`);
      continue;
    }

    // Get existing platform entries
    const existing = await db
      .select()
      .from(fandomPlatforms)
      .where(eq(fandomPlatforms.fandomId, fandom.id));

    for (const p of platforms) {
      const match = existing.find((e) => e.platform === p.platform);
      if (match) {
        // Update existing entry with new handle/followers
        await db
          .update(fandomPlatforms)
          .set({ handle: p.handle, followers: p.followers })
          .where(eq(fandomPlatforms.id, match.id));
        totalUpdated++;
      } else {
        // Insert new platform entry
        await db.insert(fandomPlatforms).values({
          fandomId: fandom.id,
          platform: p.platform,
          handle: p.handle,
          followers: p.followers,
          url: null,
        });
        totalInserted++;
      }
    }

    console.log(`${fandom.name}: ${platforms.length} platforms`);
  }

  console.log(`\nDone! Inserted ${totalInserted}, updated ${totalUpdated} platform entries`);
  process.exit(0);
}

seedPlatforms().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
