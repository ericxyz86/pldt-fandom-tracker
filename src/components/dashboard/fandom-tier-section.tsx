"use client";

import { FandomCard } from "./fandom-card";
import type { FandomTier, FandomWithMetrics } from "@/types/fandom";

const tierInfo: Record<FandomTier, { title: string; description: string; color: string }> = {
  emerging: {
    title: "Emerging Fandoms",
    description: "Rapidly growing communities with high engagement potential",
    color: "border-l-emerald-500",
  },
  trending: {
    title: "Trending Fandoms",
    description: "Viral, high-activity fandoms dominating social platforms",
    color: "border-l-orange-500",
  },
  existing: {
    title: "Established Fandoms",
    description: "Loyal, long-term communities with consistent engagement",
    color: "border-l-blue-500",
  },
};

interface FandomTierSectionProps {
  tier: FandomTier;
  fandoms: FandomWithMetrics[];
}

export function FandomTierSection({ tier, fandoms }: FandomTierSectionProps) {
  const info = tierInfo[tier];

  if (fandoms.length === 0) return null;

  return (
    <section className={`border-l-4 ${info.color} pl-4`}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{info.title}</h2>
        <p className="text-sm text-muted-foreground">{info.description}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {fandoms.map((fandom) => (
          <FandomCard key={fandom.slug} fandom={fandom} />
        ))}
      </div>
    </section>
  );
}
