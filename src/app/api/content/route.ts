import { NextResponse } from "next/server";
import { getAllContent } from "@/lib/services/fandom.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const content = await getAllContent();
    return NextResponse.json(content);
  } catch (error) {
    console.error("Failed to fetch content:", error);
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    );
  }
}
