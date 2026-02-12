"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AIInsightCard } from "@/components/dashboard/ai-insight-card";
import { TrendsUpload } from "@/components/dashboard/trends-upload";

// Deterministic color per fandom slug — stable across date ranges, add/delete
function getFandomColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash) + slug.charCodeAt(i);
    hash |= 0;
  }
  // Spread hue across 360° wheel, vary lightness slightly for extra distinction
  const hue = Math.abs(hash) % 360;
  const lightness = 42 + (Math.abs(hash >> 8) % 16); // 42-58%
  return `hsl(${hue}, 72%, ${lightness}%)`;
}

interface TrendItem {
  id: string;
  fandomId: string;
  keyword: string;
  date: string;
  interestValue: number;
  region: string;
  fandomName: string;
  fandomSlug: string;
}

const DATE_RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

export default function TrendsPage() {
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState<number>(90);

  const loadTrends = () => {
    setLoading(true);
    fetch("/api/trends")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTrends(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadTrends();
  }, []);

  // Filter trends by selected date range
  const filteredTrends = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return trends.filter((t) => t.date >= cutoffStr);
  }, [trends, rangeDays]);

  // Build from ALL trends (not filtered) so slug list + colors are stable across date ranges
  const allFandomSlugs = useMemo(() => {
    const map = new Map<string, string>();
    trends.forEach((t) => map.set(t.fandomSlug, t.fandomName));
    // Sort alphabetically for consistent ordering
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [trends]);

  // Only show fandoms that have data in the current date range
  const visibleSlugs = useMemo(() => {
    const visible = new Set<string>();
    filteredTrends.forEach((t) => visible.add(t.fandomSlug));
    return visible;
  }, [filteredTrends]);

  const fandomSlugs = useMemo(
    () => allFandomSlugs.filter(([slug]) => visibleSlugs.has(slug)),
    [allFandomSlugs, visibleSlugs]
  );

  const trendData = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};
    filteredTrends.forEach((t) => {
      if (!dateMap[t.date]) dateMap[t.date] = {};
      dateMap[t.date][t.fandomSlug] = t.interestValue;
    });
    const sorted = Object.entries(dateMap)
      .map(([date, values]) => ({ date, ...values }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Re-normalize to 0-100 within the visible window
    // so the highest point in the filtered range = 100
    const slugKeys = fandomSlugs.map(([slug]) => slug);
    let maxVal = 0;
    for (const row of sorted) {
      for (const key of slugKeys) {
        const v = (row as Record<string, number | string>)[key];
        if (typeof v === "number" && v > maxVal) maxVal = v;
      }
    }
    if (maxVal > 0 && maxVal !== 100) {
      const scale = 100 / maxVal;
      return sorted.map((row) => {
        const normalized: Record<string, number | string> = { date: row.date };
        for (const key of slugKeys) {
          const v = (row as Record<string, number | string>)[key];
          normalized[key] = typeof v === "number" ? Math.round(v * scale) : 0;
        }
        return normalized;
      });
    }
    return sorted;
  }, [filteredTrends, fandomSlugs]);

  const chartConfig = Object.fromEntries(
    fandomSlugs.map(([slug, name]) => [
      slug,
      { label: name, color: getFandomColor(slug) },
    ])
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[450px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trends</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Google Trends interest comparison across Philippine fandoms
        </p>
      </div>

      <AIInsightCard
        page="trends"
        sections={[
          { label: "Summary", key: "summary" },
          { label: "Top Mover", key: "topMover" },
          { label: "Patterns", key: "patterns" },
          { label: "Recommendation", key: "recommendation" },
        ]}
      />

      <TrendsUpload onUploadComplete={loadTrends} />

      {trends.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No Google Trends data available yet. Upload a CSV from Google Trends or run a scrape from Settings.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">
                Interest Over Time ({rangeDays} days)
              </CardTitle>
              <div className="flex gap-1">
                {DATE_RANGES.map((r) => (
                  <button
                    key={r.days}
                    onClick={() => setRangeDays(r.days)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      rangeDays === r.days
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={chartConfig}
                className="h-[400px] w-full"
              >
                <LineChart
                  data={trendData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                    className="text-xs"
                  />
                  <YAxis className="text-xs" domain={[0, 100]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {fandomSlugs.map(([slug]) => (
                    <Line
                      key={slug}
                      type="monotone"
                      dataKey={slug}
                      stroke={getFandomColor(slug)}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            {fandomSlugs.map(([slug, name]) => (
              <div key={slug} className="flex items-center gap-2 text-sm">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: getFandomColor(slug) }}
                />
                <span>{name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
