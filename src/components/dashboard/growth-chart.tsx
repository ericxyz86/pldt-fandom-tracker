"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { MetricSnapshot } from "@/types/fandom";

interface GrowthChartProps {
  metrics: MetricSnapshot[];
}

const chartConfig = {
  growthRate: {
    label: "Growth Rate %",
    color: "hsl(var(--chart-3))",
  },
};

export function GrowthChart({ metrics }: GrowthChartProps) {
  const aggregated = metrics.reduce(
    (acc, m) => {
      if (!acc[m.date]) {
        acc[m.date] = { date: m.date, growthRate: 0, count: 0 };
      }
      acc[m.date].growthRate += m.growthRate;
      acc[m.date].count += 1;
      return acc;
    },
    {} as Record<string, { date: string; growthRate: number; count: number }>
  );

  const data = Object.values(aggregated)
    .map((d) => ({
      date: d.date,
      growthRate: parseFloat((d.growthRate / d.count).toFixed(2)),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <LineChart
        data={data}
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
        <YAxis className="text-xs" unit="%" />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="growthRate"
          stroke="var(--color-growthRate)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
