"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { getMockFandoms, getMockTrends } from "@/lib/data/mock";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#e91e8c",
  "#ff4500",
  "#1877f2",
  "#00c853",
  "#ff6d00",
];

export default function TrendsPage() {
  const fandoms = useMemo(() => getMockFandoms(), []);

  const trendData = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};

    fandoms.forEach((f) => {
      const trends = getMockTrends(f.id);
      trends.forEach((t) => {
        if (!dateMap[t.date]) dateMap[t.date] = {};
        dateMap[t.date][f.slug] = t.interestValue;
      });
    });

    return Object.entries(dateMap)
      .map(([date, values]) => ({ date, ...values }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [fandoms]);

  const chartConfig = Object.fromEntries(
    fandoms.map((f, i) => [
      f.slug,
      { label: f.name, color: COLORS[i % COLORS.length] },
    ])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trends</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Google Trends interest comparison across Philippine fandoms
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Interest Over Time (90 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[400px] w-full">
            <LineChart
              data={trendData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
              {fandoms.map((f, i) => (
                <Line
                  key={f.slug}
                  type="monotone"
                  dataKey={f.slug}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  name={f.name}
                />
              ))}
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {fandoms.map((f, i) => (
          <div key={f.slug} className="flex items-center gap-2 text-sm">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span>{f.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
