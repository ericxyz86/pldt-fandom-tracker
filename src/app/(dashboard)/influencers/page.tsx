"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber } from "@/lib/utils/format";
import { PlatformIcon } from "@/components/dashboard/platform-icon";
import type { Platform, FandomTier, Influencer } from "@/types/fandom";

interface InfluencerWithFandom extends Influencer {
  fandomName: string;
  tier: FandomTier;
}

export default function InfluencersPage() {
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [allInfluencers, setAllInfluencers] = useState<InfluencerWithFandom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/influencers")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAllInfluencers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = allInfluencers;
    if (platformFilter !== "all") {
      result = result.filter((i) => i.platform === platformFilter);
    }
    return result.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }, [allInfluencers, platformFilter]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Influencers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Key influencers and fan accounts across Philippine fandoms
          </p>
        </div>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
            <SelectItem value="twitter">Twitter/X</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No influencer data available yet. Run influencer discovery scrapes from the Settings page to populate this data.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.slice(0, 24).map((inf) => (
            <Card key={inf.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                    {inf.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm truncate">
                        @{inf.username}
                      </p>
                      <PlatformIcon platform={inf.platform as Platform} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {inf.fandomName}
                    </p>

                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Followers
                        </p>
                        <p className="text-xs font-semibold">
                          {formatNumber(inf.followers)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Eng Rate
                        </p>
                        <p className="text-xs font-semibold">
                          {inf.engagementRate}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Score
                        </p>
                        <p className="text-xs font-semibold">
                          {inf.relevanceScore}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
