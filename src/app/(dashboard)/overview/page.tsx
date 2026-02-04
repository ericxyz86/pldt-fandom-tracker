"use client";

import { useEffect, useMemo, useState } from "react";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { FandomTierSection } from "@/components/dashboard/fandom-tier-section";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useSegment } from "@/lib/context/segment-context";
import { useDateRange } from "@/lib/context/date-range-context";
import type {
  FandomTier,
  FandomWithMetrics,
  DemographicTag,
} from "@/types/fandom";

const tiers: FandomTier[] = ["emerging", "trending", "existing"];

const segmentTagMap: Record<string, DemographicTag[]> = {
  postpaid: ["abc"],
  prepaid: ["cde"],
};

export default function OverviewPage() {
  const { segment } = useSegment();
  const { from, to } = useDateRange();
  const [allFandoms, setAllFandoms] = useState<FandomWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    fetch(`/api/fandoms${qs ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        setAllFandoms(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [from, to]);

  const filteredFandoms = useMemo(() => {
    if (segment === "all") return allFandoms;
    const tags = segmentTagMap[segment];
    if (!tags) return allFandoms;
    return allFandoms.filter((f) =>
      tags.some((tag) => f.demographicTags.includes(tag))
    );
  }, [allFandoms, segment]);

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fandom Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and analyze Philippine fandoms for PLDT Home campaigns
          </p>
        </div>
      </div>

      <KpiCards fandoms={filteredFandoms} />

      {segment !== "all" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtering by:</span>
          <Badge variant="secondary">
            {segment === "postpaid" ? "ABC Postpaid" : "CDE Prepaid"} - Gen Y/Z
          </Badge>
        </div>
      )}

      <div className="space-y-8">
        {tiers.map((tier) => (
          <FandomTierSection
            key={tier}
            tier={tier}
            fandoms={filteredFandoms.filter((f) => f.tier === tier)}
          />
        ))}
      </div>
    </div>
  );
}
