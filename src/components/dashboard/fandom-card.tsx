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

export function FandomCard({ fandom }: FandomCardProps) {
  const isPositiveGrowth = fandom.weeklyGrowthRate >= 0;

  return (
    <Link href={`/fandoms/${fandom.slug}`}>
      <Card className="transition-all hover:shadow-md hover:border-primary/20 cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm truncate">{fandom.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fandom.fandomGroup}
              </p>
            </div>
            <TierBadge tier={fandom.tier} />
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
        </CardContent>
      </Card>
    </Link>
  );
}
