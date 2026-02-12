"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Pie, PieChart, Cell, Legend } from "recharts";
import type { FandomPlatform } from "@/types/fandom";

interface PlatformBreakdownProps {
  platforms: FandomPlatform[];
}

const COLORS: Record<string, string> = {
  instagram: "#e91e8c",
  tiktok: "#000000",
  facebook: "#1877f2",
  youtube: "#ff0000",
  twitter: "#1da1f2",
  reddit: "#ff4500",
};

const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
  twitter: "X / Twitter",
  reddit: "Reddit",
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

export function PlatformBreakdown({ platforms }: PlatformBreakdownProps) {
  const data = platforms
    .filter((p) => p.followers > 0)
    .map((p) => ({
      name: platformLabels[p.platform] || p.platform,
      value: p.followers,
      fill: COLORS[p.platform] || "#888888",
    }));

  const total = data.reduce((s, d) => s + d.value, 0);

  const chartConfig = Object.fromEntries(
    platforms.map((p) => [
      platformLabels[p.platform] || p.platform,
      { label: platformLabels[p.platform], color: COLORS[p.platform] || "#888888" },
    ])
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Follower distribution across platforms — total: <span className="font-medium text-foreground">{formatNumber(total)}</span>
      </p>
      <ChartContainer config={chartConfig} className="h-[280px] w-full">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
          </Pie>
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value: any) => formatNumber(Number(value))}
              />
            }
          />
          <Legend
            verticalAlign="bottom"
            formatter={(value: string) => {
              const item = data.find((d) => d.name === value);
              const pct = item && total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
              return (
                <span className="text-xs">
                  {value} — {item ? formatNumber(item.value) : "0"} ({pct}%)
                </span>
              );
            }}
          />
        </PieChart>
      </ChartContainer>
    </div>
  );
}
