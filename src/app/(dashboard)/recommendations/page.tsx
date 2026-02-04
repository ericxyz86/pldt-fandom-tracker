"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils/format";
import { PlatformIcon } from "@/components/dashboard/platform-icon";
import { TierBadge } from "@/components/dashboard/tier-badge";
import { useSegment } from "@/lib/context/segment-context";
import type { Platform, Recommendation } from "@/types/fandom";

export default function RecommendationsPage() {
  const { segment } = useSegment();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/recommendations")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRecommendations(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    let result = recommendations;
    if (segment !== "all") {
      const target = segment === "postpaid" ? "postpaid" : "prepaid";
      result = result.filter((r) => r.segment === target);
    }
    return [...result].sort((a, b) => b.score - a.score);
  }, [recommendations, segment]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campaign Recommendations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Campaign suggestions based on fandom momentum, engagement quality, and
          demographic fit
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sorted.map((rec) => (
          <Card key={rec.id} className="relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold rounded-bl-lg">
              Score: {rec.score}
            </div>
            <CardHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base">{rec.fandomName}</CardTitle>
                {!rec.hasBeenScraped && (
                  <Badge className="bg-amber-500 text-white border-amber-600 text-[10px] px-2 py-0.5 shrink-0">
                    NEW
                  </Badge>
                )}
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

              {rec.contentInsight && (
                <div className="space-y-3 border-t pt-3">
                  <div>
                    <p className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                      Content Type
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {rec.contentInsight.contentBreakdown.map((b) => (
                        <Badge key={b.type} variant="secondary" className="text-[10px] capitalize">
                          {b.type} ({b.percentage}%)
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium mb-1 flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      Community Tone
                    </p>
                    <p className="text-xs text-muted-foreground">{rec.contentInsight.tone}</p>
                  </div>

                  {rec.contentInsight.topHashtags.length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg>
                        Top Hashtags
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {rec.contentInsight.topHashtags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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
