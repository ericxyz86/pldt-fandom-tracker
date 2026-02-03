import { NextResponse } from "next/server";
import { getFandomBySlug } from "@/lib/services/fandom.service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fandomId: string }> }
) {
  const { fandomId } = await params;

  try {
    const fandom = await getFandomBySlug(fandomId);

    if (!fandom) {
      return NextResponse.json({ error: "Fandom not found" }, { status: 404 });
    }

    return NextResponse.json(fandom);
  } catch (error) {
    console.error("Failed to fetch fandom:", error);
    return NextResponse.json(
      { error: "Failed to fetch fandom" },
      { status: 500 }
    );
  }
}
