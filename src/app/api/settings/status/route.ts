import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fandoms } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const apifyToken = process.env.APIFY_TOKEN;
  const databaseUrl = process.env.DATABASE_URL;

  let dbConnected = false;
  let fandomCount = 0;

  if (databaseUrl) {
    try {
      const result = await db.select({ count: sql<number>`count(*)` }).from(fandoms);
      dbConnected = true;
      fandomCount = Number(result[0].count);
    } catch {
      dbConnected = false;
    }
  }

  return NextResponse.json({
    apify: {
      configured: !!apifyToken,
    },
    database: {
      connected: dbConnected,
      fandomCount,
    },
  });
}
