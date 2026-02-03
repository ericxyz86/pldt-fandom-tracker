"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TierBadge } from "@/components/dashboard/tier-badge";
import { PlatformIcons } from "@/components/dashboard/platform-icon";
import { EngagementChart } from "@/components/dashboard/engagement-chart";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { PlatformBreakdown } from "@/components/dashboard/platform-breakdown";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  FandomTier,
  Platform,
  MetricSnapshot,
  ContentItem,
  Influencer,
} from "@/types/fandom";

interface FandomDetail {
  id: string;
  name: string;
  slug: string;
  tier: FandomTier;
  description: string | null;
  imageUrl: string | null;
  fandomGroup: string | null;
  demographicTags: string[];
  platforms: { id: string; fandomId: string; platform: Platform; handle: string; followers: number; url: string | null }[];
  totalFollowers: number;
  avgEngagementRate: number;
  weeklyGrowthRate: number;
  latestMetrics: MetricSnapshot[];
  content: ContentItem[];
  influencers: Influencer[];
}

export default function FandomDetailPage() {
  const params = useParams();
  const slug = params.fandomId as string;

  const [fandom, setFandom] = useState<FandomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/fandoms/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setFandom(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !fandom) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Fandom not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{fandom.name}</h1>
            <TierBadge tier={fandom.tier} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {fandom.description}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <PlatformIcons
              platforms={fandom.platforms.map((p) => p.platform)}
            />
            <span className="text-xs text-muted-foreground">
              {fandom.fandomGroup}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {fandom.demographicTags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag === "gen_z"
                  ? "Gen Z"
                  : tag === "gen_y"
                    ? "Gen Y"
                    : tag.toUpperCase()}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">
              {formatNumber(fandom.totalFollowers)}
            </p>
            <p className="text-xs text-muted-foreground">Total Followers</p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              {fandom.avgEngagementRate.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">Engagement Rate</p>
          </div>
          <div>
            <p
              className={`text-2xl font-bold ${fandom.weeklyGrowthRate >= 0 ? "text-emerald-600" : "text-red-500"}`}
            >
              {formatPercent(fandom.weeklyGrowthRate)}
            </p>
            <p className="text-xs text-muted-foreground">Weekly Growth</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="metrics">
        <TabsList>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="influencers">Influencers</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Engagement Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <EngagementChart metrics={fandom.latestMetrics} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Growth Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <GrowthChart metrics={fandom.latestMetrics} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Platform Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <PlatformBreakdown platforms={fandom.platforms} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Top Content</CardTitle>
            </CardHeader>
            <CardContent>
              {fandom.content.length === 0 ? (
                <p className="text-sm text-muted-foreground">No content data available yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Likes</TableHead>
                      <TableHead className="text-right">Comments</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fandom.content
                      .sort((a, b) => b.likes - a.likes)
                      .slice(0, 10)
                      .map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="capitalize">
                            {item.platform}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {item.contentType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(item.likes)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(item.comments)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(item.shares)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(item.views)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="influencers">
          {fandom.influencers.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">No influencer data available yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fandom.influencers
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .map((inf) => (
                  <Card key={inf.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                          {inf.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-sm">
                            @{inf.username}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {inf.platform}
                          </p>
                          <div className="grid grid-cols-3 gap-2 mt-2">
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Followers
                              </p>
                              <p className="text-sm font-medium">
                                {formatNumber(inf.followers)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Eng. Rate
                              </p>
                              <p className="text-sm font-medium">
                                {inf.engagementRate}%
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Score
                              </p>
                              <p className="text-sm font-medium">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
