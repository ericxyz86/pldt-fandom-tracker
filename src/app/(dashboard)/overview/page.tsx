"use client";

import { useMemo, useState } from "react";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { FandomTierSection } from "@/components/dashboard/fandom-tier-section";
import { getMockFandoms } from "@/lib/data/mock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FandomTier, DemographicTag, MarketSegment } from "@/types/fandom";

const tiers: FandomTier[] = ["emerging", "trending", "existing"];

const segmentFilters: { value: MarketSegment; label: string; tags: DemographicTag[] }[] = [
  { value: "all", label: "All Segments", tags: [] },
  { value: "postpaid", label: "ABC Postpaid", tags: ["abc"] },
  { value: "prepaid", label: "CDE Prepaid", tags: ["cde"] },
];

export default function OverviewPage() {
  const [activeSegment, setActiveSegment] = useState<MarketSegment>("all");
  const allFandoms = useMemo(() => getMockFandoms(), []);

  const filteredFandoms = useMemo(() => {
    if (activeSegment === "all") return allFandoms;
    const filter = segmentFilters.find((s) => s.value === activeSegment);
    if (!filter || filter.tags.length === 0) return allFandoms;
    return allFandoms.filter((f) =>
      filter.tags.some((tag) => f.demographicTags.includes(tag))
    );
  }, [allFandoms, activeSegment]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fandom Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and analyze Philippine fandoms for PLDT Home campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          {segmentFilters.map((seg) => (
            <Button
              key={seg.value}
              variant={activeSegment === seg.value ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveSegment(seg.value)}
            >
              {seg.label}
            </Button>
          ))}
        </div>
      </div>

      <KpiCards fandoms={filteredFandoms} />

      {activeSegment !== "all" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtering by:</span>
          <Badge variant="secondary">
            {activeSegment === "postpaid" ? "ABC Postpaid" : "CDE Prepaid"} - Gen Y/Z
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
