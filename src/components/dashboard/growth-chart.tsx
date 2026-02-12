"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricSnapshot } from "@/types/fandom";

interface GrowthChartProps {
  metrics: MetricSnapshot[];
}

const chartConfig = {
  followers: {
    label: "Followers",
    color: "hsl(var(--chart-3))",
  },
};

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export function GrowthChart({ metrics }: GrowthChartProps) {
  // Aggregate total followers per date across all platforms
  const aggregated = metrics.reduce(
    (acc, m) => {
      if (!acc[m.date]) {
        acc[m.date] = { date: m.date, followers: 0 };
      }
      acc[m.date].followers += m.followers;
      return acc;
    },
    {} as Record<string, { date: string; followers: number }>
  );

  const data = Object.values(aggregated)
    .filter((d) => d.followers > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        No follower data yet
      </div>
    );
  }

  if (data.length === 1) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground text-sm gap-2">
        <span className="text-2xl font-semibold text-foreground">{formatFollowers(data[0].followers)}</span>
        <span>Total followers as of {data[0].date}</span>
        <span className="text-xs">Growth tracking starts after next scrape cycle</span>
      </div>
    );
  }

  // Calculate growth percentage for display
  const firstVal = data[0]?.followers || 0;
  const lastVal = data[data.length - 1]?.followers || 0;
  const growthPct =
    firstVal > 0
      ? (((lastVal - firstVal) / firstVal) * 100).toFixed(2)
      : "0";

  return (
    <div>
      {data.length >= 2 && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <span
            className={`text-xs font-medium ${
              Number(growthPct) >= 0 ? "text-green-600" : "text-red-500"
            }`}
          >
            {Number(growthPct) >= 0 ? "+" : ""}
            {growthPct}% since {data[0].date}
          </span>
        </div>
      )}
      <ChartContainer config={chartConfig} className="h-[270px] w-full">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--chart-3))"
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--chart-3))"
                stopOpacity={0.05}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            className="text-xs"
          />
          <YAxis
            className="text-xs"
            tickFormatter={formatFollowers}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => formatFollowers(Number(value))}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="followers"
            stroke="hsl(var(--chart-3))"
            strokeWidth={2.5}
            fill="url(#growthFill)"
            dot={{ r: 4, fill: "hsl(var(--chart-3))" }}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
