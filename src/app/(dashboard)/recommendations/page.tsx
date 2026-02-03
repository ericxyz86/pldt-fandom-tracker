"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMockRecommendations } from "@/lib/data/mock";
import { formatNumber } from "@/lib/utils/format";
import { PlatformIcon } from "@/components/dashboard/platform-icon";
import { TierBadge } from "@/components/dashboard/tier-badge";
import type { Platform } from "@/types/fandom";

export default function RecommendationsPage() {
  const recommendations = useMemo(() => getMockRecommendations(), []);

  const sorted = [...recommendations].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campaign Recommendations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-generated campaign suggestions based on fandom momentum, engagement
          quality, and demographic fit
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sorted.map((rec) => (
          <Card key={rec.id} className="relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold rounded-bl-lg">
              Score: {rec.score}
            </div>
            <CardHeader>
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">{rec.fandomName}</CardTitle>
                <TierBadge tier={rec.tier} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{rec.rationale}</p>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <PlatformIcon
                    platform={rec.suggestedPlatform as Platform}
                  />
                  <span className="text-xs capitalize">
                    {rec.suggestedPlatform}
                  </span>
                </div>
                <Badge
                  variant={
                    rec.segment === "postpaid" ? "default" : "secondary"
                  }
                  className="text-xs"
                >
                  {rec.segment === "postpaid" ? "ABC Postpaid" : "CDE Prepaid"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Est. Reach: {formatNumber(rec.estimatedReach)}
                </span>
              </div>

              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs font-medium mb-1">Suggested Action:</p>
                <p className="text-xs text-muted-foreground">
                  {rec.suggestedAction}
                </p>
              </div>

              <div className="flex flex-wrap gap-1">
                {rec.demographicTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] px-1.5"
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
        ))}
      </div>

      {sorted.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No recommendations available yet. Run data scrapes to generate
            insights.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
