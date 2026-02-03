import { NextResponse } from "next/server";
import { getAllFandoms } from "@/lib/services/fandom.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const fandoms = await getAllFandoms();
    return NextResponse.json(fandoms);
  } catch (error) {
    console.error("Failed to fetch fandoms:", error);
    return NextResponse.json(
      { error: "Failed to fetch fandoms" },
      { status: 500 }
    );
  }
}
