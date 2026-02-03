import { NextResponse } from "next/server";
import { getRecommendations } from "@/lib/services/fandom.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const recommendations = await getRecommendations();
    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("Failed to generate recommendations:", error);
    return NextResponse.json(
      { error: "Failed to generate recommendations" },
      { status: 500 }
    );
  }
}
