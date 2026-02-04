import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiPageInsights } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VALID_PAGES = ["trends", "content", "influencers"];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ page: string }> }
) {
  const { page } = await params;

  if (!VALID_PAGES.includes(page)) {
    return NextResponse.json(
      { error: "Invalid page. Must be one of: trends, content, influencers" },
      { status: 400 }
    );
  }

  try {
    const rows = await db
      .select()
      .from(aiPageInsights)
      .where(eq(aiPageInsights.page, page))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(null);
    }

    const row = rows[0];
    return NextResponse.json({
      page: row.page,
      insights: JSON.parse(row.insights),
      generatedAt: row.generatedAt,
    });
  } catch (error) {
    console.error(`[API] Failed to fetch insights for ${page}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 }
    );
  }
}
