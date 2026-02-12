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

const COLORS = [
  "#2563eb",
  "#e11d48",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#e91e8c",
  "#ff4500",
  "#1877f2",
  "#00c853",
  "#ff6d00",
];

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

  const fandomSlugs = useMemo(() => {
    const map = new Map<string, string>();
    filteredTrends.forEach((t) => map.set(t.fandomSlug, t.fandomName));
    return Array.from(map.entries());
  }, [filteredTrends]);

  const trendData = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};
    filteredTrends.forEach((t) => {
      if (!dateMap[t.date]) dateMap[t.date] = {};
      dateMap[t.date][t.fandomSlug] = t.interestValue;
    });
    return Object.entries(dateMap)
      .map(([date, values]) => ({ date, ...values }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredTrends]);

  const chartConfig = Object.fromEntries(
    fandomSlugs.map(([slug, name], i) => [
      slug,
      { label: name, color: COLORS[i % COLORS.length] },
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
                  {fandomSlugs.map(([slug], i) => (
                    <Line
                      key={slug}
                      type="monotone"
                      dataKey={slug}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            {fandomSlugs.map(([slug, name], i) => (
              <div key={slug} className="flex items-center gap-2 text-sm">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
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
