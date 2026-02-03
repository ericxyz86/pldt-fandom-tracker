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

interface EngagementChartProps {
  metrics: MetricSnapshot[];
}

const chartConfig = {
  engagement: {
    label: "Engagement",
    color: "hsl(var(--chart-1))",
  },
};

export function EngagementChart({ metrics }: EngagementChartProps) {
  const aggregated = metrics.reduce(
    (acc, m) => {
      if (!acc[m.date]) {
        acc[m.date] = { date: m.date, engagement: 0 };
      }
      acc[m.date].engagement += m.engagementTotal;
      return acc;
    },
    {} as Record<string, { date: string; engagement: number }>
  );

  const data = Object.values(aggregated).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
          className="text-xs"
        />
        <YAxis className="text-xs" />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          type="monotone"
          dataKey="engagement"
          stroke="var(--color-engagement)"
          fill="var(--color-engagement)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
