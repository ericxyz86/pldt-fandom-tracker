"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Pie, PieChart, Cell } from "recharts";
import type { FandomPlatform } from "@/types/fandom";

interface PlatformBreakdownProps {
  platforms: FandomPlatform[];
}

const COLORS = [
  "#e91e8c",
  "#000000",
  "#1877f2",
  "#ff0000",
  "#1da1f2",
  "#ff4500",
];

const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
  twitter: "X / Twitter",
  reddit: "Reddit",
};

export function PlatformBreakdown({ platforms }: PlatformBreakdownProps) {
  const data = platforms.map((p) => ({
    name: platformLabels[p.platform] || p.platform,
    value: p.followers,
  }));

  const chartConfig = Object.fromEntries(
    platforms.map((p, i) => [
      p.platform,
      { label: platformLabels[p.platform], color: COLORS[i % COLORS.length] },
    ])
  );

  return (
    <ChartContainer config={chartConfig} className="h-[250px] w-full">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <ChartTooltip content={<ChartTooltipContent />} />
      </PieChart>
    </ChartContainer>
  );
}
