"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import type { FandomWithMetrics } from "@/types/fandom";

interface KpiCardsProps {
  fandoms: FandomWithMetrics[];
}

export function KpiCards({ fandoms }: KpiCardsProps) {
  const totalFandoms = fandoms.length;
  const totalFollowers = fandoms.reduce((s, f) => s + f.totalFollowers, 0);
  const avgGrowth =
    fandoms.length > 0
      ? fandoms.reduce((s, f) => s + f.weeklyGrowthRate, 0) / fandoms.length
      : 0;
  const avgEngagement =
    fandoms.length > 0
      ? fandoms.reduce((s, f) => s + f.avgEngagementRate, 0) / fandoms.length
      : 0;
  const topFandom = fandoms.reduce((best, f) => {
    if (!best) return f;
    // Primary: highest growth rate
    if (f.weeklyGrowthRate > best.weeklyGrowthRate) return f;
    if (f.weeklyGrowthRate < best.weeklyGrowthRate) return best;
    // Tiebreaker: highest engagement rate
    if (f.avgEngagementRate > best.avgEngagementRate) return f;
    return best;
  }, fandoms[0]);

  const kpis = [
    {
      label: "Fandoms Tracked",
      value: totalFandoms.toString(),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      label: "Total Reach",
      value: formatNumber(totalFollowers),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
        </svg>
      ),
    },
    {
      label: "Avg Growth Rate",
      value: formatPercent(avgGrowth),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
        </svg>
      ),
    },
    {
      label: "Avg Engagement",
      value: `${avgEngagement.toFixed(1)}%`,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      ),
    },
    {
      label: "Top Performer",
      value: topFandom?.name || "N/A",
      sub: topFandom
        ? `${formatPercent(topFandom.weeklyGrowthRate)} weekly`
        : undefined,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              {kpi.icon}
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="text-xl font-bold">{kpi.value}</p>
            {kpi.sub && (
              <p className="text-xs text-muted-foreground">{kpi.sub}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
