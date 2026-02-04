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

export default function TrendsPage() {
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trends")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTrends(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fandomSlugs = useMemo(() => {
    const map = new Map<string, string>();
    trends.forEach((t) => map.set(t.fandomSlug, t.fandomName));
    return Array.from(map.entries());
  }, [trends]);

  const trendData = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};
    trends.forEach((t) => {
      if (!dateMap[t.date]) dateMap[t.date] = {};
      dateMap[t.date][t.fandomSlug] = t.interestValue;
    });
    return Object.entries(dateMap)
      .map(([date, values]) => ({ date, ...values }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [trends]);

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

      {trends.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No Google Trends data available yet. Run a Google Trends scrape from
            the Settings page to populate this chart.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Interest Over Time (90 days)
              </CardTitle>
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
