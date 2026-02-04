"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TierBadge } from "./tier-badge";
import { PlatformIcons } from "./platform-icon";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import type { FandomWithMetrics } from "@/types/fandom";

interface FandomCardProps {
  fandom: FandomWithMetrics;
}

function deriveKeyBehavior(fandom: FandomWithMetrics): string {
  const traits: string[] = [];

  if (fandom.weeklyGrowthRate > 5) traits.push("rapidly growing participation");
  else if (fandom.weeklyGrowthRate > 2) traits.push("steady audience growth");
  else if (fandom.weeklyGrowthRate > 0) traits.push("stable community presence");
  else traits.push("mature, loyal fanbase");

  if (fandom.avgEngagementRate > 15) traits.push("highly interactive audience");
  else if (fandom.avgEngagementRate > 5) traits.push("active content engagement");

  if (fandom.tier === "emerging") traits.push("trend adoption, niche interests");
  else if (fandom.tier === "trending") traits.push("viral content creation, cross-platform sharing");
  else traits.push("consistent brand affinity");

  const platformCount = fandom.platforms.length;
  if (platformCount >= 4) traits.push("multi-platform reach");
  else if (platformCount >= 2) traits.push("cross-platform activity");

  return traits.slice(0, 3).map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(", ");
}

function deriveEngagementPotential(fandom: FandomWithMetrics): { level: string; description: string; color: string } {
  const engRate = fandom.avgEngagementRate;
  const growth = fandom.weeklyGrowthRate;

  if ((engRate > 10 && growth > 2) || (engRate > 15) || (growth > 5)) {
    const actions: string[] = [];
    if (fandom.tier === "emerging") actions.push("early brand activations");
    else actions.push("branded content partnerships");
    if (engRate > 10) actions.push("content collaborations");
    if (fandom.platforms.length >= 3) actions.push("multi-platform campaigns");
    else actions.push("micro-influencer tie-ins");
    return { level: "High", description: actions.join(", "), color: "text-emerald-600" };
  }

  if (engRate > 3 || growth > 1) {
    const actions: string[] = [];
    actions.push("sponsored content");
    if (growth > 1) actions.push("growth-stage partnerships");
    else actions.push("community engagement campaigns");
    actions.push("fan event sponsorships");
    return { level: "Medium", description: actions.join(", "), color: "text-amber-600" };
  }

  return {
    level: "Steady",
    description: "brand visibility, periodic sponsored posts, trend monitoring",
    color: "text-blue-600",
  };
}

export function FandomCard({ fandom }: FandomCardProps) {
  const isPositiveGrowth = fandom.weeklyGrowthRate >= 0;
  const keyBehavior = fandom.aiKeyBehavior || deriveKeyBehavior(fandom);
  const derived = deriveEngagementPotential(fandom);
  // When AI data exists but no real metrics yet, don't show misleading rule-based level
  const hasNoMetrics = fandom.totalFollowers === 0 && fandom.avgEngagementRate === 0;
  const engagementPotential = fandom.aiEngagementPotential && hasNoMetrics
    ? { level: "", description: fandom.aiEngagementPotential, color: "text-muted-foreground" }
    : derived;

  return (
    <Link href={`/fandoms/${fandom.slug}`}>
      <Card className="transition-all hover:shadow-md hover:border-primary/20 cursor-pointer">
        <CardHeader className="pb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-sm">{fandom.name}</h3>
              {!fandom.hasBeenScraped && (
                <Badge className="bg-amber-500 text-white border-amber-600 text-[10px] px-2 py-0.5 shrink-0">
                  NEW
                </Badge>
              )}
              <TierBadge tier={fandom.tier} />
            </div>
            <p className="text-xs text-muted-foreground">
              {fandom.fandomGroup}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-1.5">
            <PlatformIcons
              platforms={fandom.platforms.map((p) => p.platform)}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Followers</p>
              <p className="text-sm font-semibold">
                {formatNumber(fandom.totalFollowers)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Engagement</p>
              <p className="text-sm font-semibold">
                {fandom.avgEngagementRate.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Growth</p>
              <p
                className={`text-sm font-semibold flex items-center gap-0.5 ${
                  isPositiveGrowth ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {isPositiveGrowth ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                )}
                {formatPercent(fandom.weeklyGrowthRate)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {fandom.demographicTags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                {tag === "gen_z"
                  ? "Gen Z"
                  : tag === "gen_y"
                    ? "Gen Y"
                    : tag.toUpperCase()}
              </Badge>
            ))}
          </div>

          <div className="border-t pt-2 space-y-1.5">
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">Key Behavior</p>
              <p className="text-xs">{keyBehavior}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">Engagement Potential</p>
              <p className="text-xs">
                {engagementPotential.level && (
                  <>
                    <span className={`font-semibold ${engagementPotential.color}`}>{engagementPotential.level}</span>
                    {" — "}
                  </>
                )}
                {fandom.aiEngagementPotential || engagementPotential.description}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
