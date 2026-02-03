import { NextResponse } from "next/server";
import { discoverFandoms } from "@/lib/services/discovery.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const discoveries = await discoverFandoms();
    return NextResponse.json(discoveries);
  } catch (error) {
    console.error("Failed to discover fandoms:", error);
    return NextResponse.json(
      { error: "Failed to discover fandoms" },
      { status: 500 }
    );
  }
}
