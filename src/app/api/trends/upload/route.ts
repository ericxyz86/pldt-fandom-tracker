import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { googleTrends, fandoms } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

// POST /api/trends/upload — Upload Google Trends CSV data
// Accepts multipart form data with a CSV file from Google Trends export
// CSV format: "Week,BINI: (Philippines),SB19: (Philippines)..."
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("authorization")?.replace("Bearer ", "");
    const apiSecret = process.env.API_SECRET;
    
    // Allow same-origin requests (browser) or Bearer token
    const origin = req.headers.get("origin") || "";
    const host = req.headers.get("host") || "";
    const isSameOrigin = origin.includes(host);
    
    if (!isSameOrigin && secret !== apiSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return NextResponse.json({ error: "No CSV file provided" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    
    // Find the header row (starts with "Week," or "Day,")
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("Week,") || lines[i].startsWith("Day,") || lines[i].startsWith("Month,")) {
        headerIdx = i;
        break;
      }
    }
    
    if (headerIdx === -1) {
      return NextResponse.json({ error: "Could not find header row. Expected 'Week,...' format from Google Trends CSV." }, { status: 400 });
    }

    // Parse header to get keyword names
    const headers = parseCSVRow(lines[headerIdx]);
    const keywords = headers.slice(1).map(h => {
      // "BINI: (Philippines)" → "BINI"
      return h.replace(/:\s*\(.*\)$/, "").trim();
    });

    // Get all fandoms to match keywords
    const allFandoms = await db.select().from(fandoms);
    
    // Match keywords to fandoms (by name, case-insensitive)
    const keywordFandomMap: Record<number, string> = {};
    const matchedNames: string[] = [];
    const unmatchedNames: string[] = [];
    
    keywords.forEach((kw, idx) => {
      const fandom = allFandoms.find(f => 
        f.name.toLowerCase() === kw.toLowerCase() ||
        f.slug.toLowerCase() === kw.toLowerCase() ||
        f.name.toLowerCase().includes(kw.toLowerCase()) ||
        kw.toLowerCase().includes(f.name.toLowerCase())
      );
      if (fandom) {
        keywordFandomMap[idx] = fandom.id;
        matchedNames.push(`${kw} → ${fandom.name}`);
      } else {
        unmatchedNames.push(kw);
      }
    });

    // Parse data rows
    let inserted = 0;
    const dataRows = lines.slice(headerIdx + 1);
    
    for (const line of dataRows) {
      const cols = parseCSVRow(line);
      if (cols.length < 2) continue;
      
      // Parse date — "2025-11-17 - 2025-11-23" → use start date
      const dateStr = cols[0].replace(/\s*-\s*\d{4}.*$/, "").trim();
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) continue;
      const dateFormatted = date.toISOString().split("T")[0];
      
      for (let i = 0; i < keywords.length; i++) {
        const fandomId = keywordFandomMap[i];
        if (!fandomId) continue;
        
        const val = parseInt(cols[i + 1]) || 0;
        
        // Upsert — delete existing for this fandom+date then insert
        await db.delete(googleTrends).where(
          and(
            eq(googleTrends.fandomId, fandomId),
            eq(googleTrends.date, dateFormatted)
          )
        );
        
        await db.insert(googleTrends).values({
          fandomId,
          keyword: keywords[i],
          date: dateFormatted,
          interestValue: val,
          region: "PH",
        });
        inserted++;
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      matched: matchedNames,
      unmatched: unmatchedNames,
      dateRange: dataRows.length > 0 ? `${dataRows[0].split(",")[0]} to ${dataRows[dataRows.length - 1].split(",")[0]}` : "none",
    });
  } catch (error) {
    console.error("Trends upload error:", error);
    return NextResponse.json({ error: "Failed to process CSV" }, { status: 500 });
  }
}

function parseCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
