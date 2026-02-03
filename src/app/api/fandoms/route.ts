import { NextResponse } from "next/server";
import { getMockFandoms } from "@/lib/data/mock";

export async function GET() {
  const fandoms = getMockFandoms();
  return NextResponse.json(fandoms);
}
