import { db } from "../src/lib/db";
import { fandoms, googleTrends } from "../src/lib/db/schema";
import { sql } from "drizzle-orm";

// Seed realistic Google Trends data for all fandoms
// Based on actual Philippine fandom search interest patterns

const FANDOM_TRENDS: Record<string, { base: number; volatility: number; trend: number }> = {
  "BINI Blooms": { base: 75, volatility: 15, trend: 0.3 },
  "SB19 A'TIN": { base: 55, volatility: 12, trend: 0.1 },
  "BTS ARMY PH": { base: 60, volatility: 20, trend: -0.1 },
  "NewJeans Bunnies PH": { base: 40, volatility: 18, trend: 0.2 },
  "SEVENTEEN CARAT PH": { base: 35, volatility: 10, trend: 0.05 },
  "KAIA Stans": { base: 20, volatility: 10, trend: 0.4 },
  "G22 Nation": { base: 15, volatility: 8, trend: 0.3 },
  "Alamat Tribe": { base: 12, volatility: 6, trend: 0.2 },
  "AlDub Nation": { base: 25, volatility: 8, trend: -0.15 },
  "Drag Race PH Fans": { base: 30, volatility: 12, trend: 0.1 },
};

async function seedTrends() {
  // Clear existing trends
  await db.delete(googleTrends);
  console.log("Cleared existing trends data");

  const allFandoms = await db.select().from(fandoms);
  console.log(`Found ${allFandoms.length} fandoms`);

  const now = new Date();
  let totalInserted = 0;

  for (const fandom of allFandoms) {
    const config = FANDOM_TRENDS[fandom.name];
    if (!config) {
      console.log(`No trend config for ${fandom.name}, using defaults`);
    }
    const { base, volatility, trend } = config || { base: 20, volatility: 10, trend: 0 };

    // Generate 52 weeks of weekly data points
    for (let week = 51; week >= 0; week--) {
      const date = new Date(now);
      date.setDate(date.getDate() - week * 7);
      const dateStr = date.toISOString().split("T")[0];

      // Calculate interest value with trend, seasonality, and random noise
      const weekIndex = 51 - week;
      const trendComponent = trend * weekIndex;
      const seasonality = Math.sin(weekIndex / 52 * Math.PI * 4) * (volatility * 0.3);
      const noise = (Math.random() - 0.5) * volatility;

      // Occasional spikes (concerts, releases, events)
      const spike = Math.random() < 0.08 ? volatility * 1.5 : 0;

      let value = Math.round(base + trendComponent + seasonality + noise + spike);
      value = Math.max(0, Math.min(100, value));

      await db.insert(googleTrends).values({
        fandomId: fandom.id,
        keyword: fandom.name.replace(" PH", " Philippines"),
        date: dateStr,
        interestValue: value,
        region: "PH",
      });
      totalInserted++;
    }

    console.log(`Seeded 52 weeks of trends for ${fandom.name}`);
  }

  console.log(`\nDone! Inserted ${totalInserted} trend data points`);
  process.exit(0);
}

seedTrends().catch((err) => {
  console.error("Failed to seed trends:", err);
  process.exit(1);
});
