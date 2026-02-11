"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useDateRange } from "@/lib/context/date-range-context";
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

const platformProfileUrls: Record<Platform, (username: string) => string> = {
  instagram: (u) => `https://www.instagram.com/${u}`,
  tiktok: (u) => `https://www.tiktok.com/@${u}`,
  facebook: (u) => `https://www.facebook.com/${u}`,
  youtube: (u) => `https://www.youtube.com/@${u}`,
  twitter: (u) => `https://x.com/${u}`,
  reddit: (u) => `https://www.reddit.com/user/${u}`,
};

function getProfileUrl(platform: Platform, username: string): string {
  return platformProfileUrls[platform](username);
}

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
  influencersByEngagement: Influencer[];
  influencersByFollowers: Influencer[];
}

export default function FandomDetailPage() {
  const params = useParams();
  const slug = params.fandomId as string;
  const { from, to } = useDateRange();

  const [fandom, setFandom] = useState<FandomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [handleStatus, setHandleStatus] = useState<Record<string, { valid: boolean; error?: string; displayName?: string; followers?: number }>>({});
  const [verifying, setVerifying] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const saveHandle = async (platform: string) => {
    if (!fandom || !editValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/fandoms/${fandom.slug}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, handle: editValue.trim() }),
      });
      if (res.ok) {
        // Update local state
        setFandom((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            platforms: prev.platforms.map((p: any) =>
              p.platform === platform ? { ...p, handle: editValue.trim().replace("@", "") } : p
            ),
          };
        });
        setEditingPlatform(null);
        // Clear verification status for this platform
        setHandleStatus((prev) => {
          const next = { ...prev };
          delete next[platform];
          return next;
        });
      }
    } catch (e) {
      console.error("Save failed:", e);
    }
    setSaving(false);
  };

  const verifyHandles = async () => {
    if (!fandom) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/fandoms/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fandomId: fandom.id }),
      });
      const data = await res.json();
      const statusMap: Record<string, { valid: boolean; error?: string; displayName?: string; followers?: number }> = {};
      for (const r of data.results || []) {
        statusMap[r.platform] = { valid: r.valid, error: r.error, displayName: r.displayName, followers: r.followers };
      }
      setHandleStatus(statusMap);
    } catch (e) {
      console.error("Verify failed:", e);
    }
    setVerifying(false);
  };

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const query = qs.toString();
    fetch(`/api/fandoms/${slug}${query ? `?${query}` : ""}`)
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
  }, [slug, from, to]);

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

          {/* Platform Handles with Verification */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Platform Handles</CardTitle>
              <button
                onClick={verifyHandles}
                disabled={verifying}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 transition-colors"
              >
                {verifying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                )}
                {verifying ? "Verifying..." : "Verify Handles"}
              </button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {fandom.platforms.map((p) => {
                  const status = handleStatus[p.platform];
                  return (
                    <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-md border text-sm">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="font-medium capitalize w-20 shrink-0">{p.platform}</span>
                        {editingPlatform === p.platform ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveHandle(p.platform); if (e.key === "Escape") setEditingPlatform(null); }}
                              className="flex-1 h-7 px-2 text-xs font-mono border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                              autoFocus
                              placeholder="Enter handle..."
                            />
                            <button
                              onClick={() => saveHandle(p.platform)}
                              disabled={saving}
                              className="h-7 px-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                              {saving ? "..." : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingPlatform(null)}
                              className="h-7 px-2 text-xs rounded-md border hover:bg-accent"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingPlatform(p.platform); setEditValue(p.handle); }}
                            className="text-muted-foreground font-mono text-xs hover:text-foreground hover:underline transition-colors cursor-pointer truncate"
                            title="Click to edit handle"
                          >
                            @{p.handle}
                          </button>
                        )}
                      </div>
                      {editingPlatform !== p.platform && (
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {status ? (
                          status.valid ? (
                            <span className="flex items-center gap-1 text-emerald-600 text-xs">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                              {status.displayName || "Valid"}
                              {status.followers ? ` · ${status.followers >= 1000000 ? (status.followers / 1000000).toFixed(1) + "M" : status.followers >= 1000 ? (status.followers / 1000).toFixed(1) + "K" : status.followers}` : ""}
                            </span>
                          ) : (
                            <span
                              className="flex items-center gap-1 text-red-500 text-xs cursor-pointer hover:underline"
                              onClick={() => { setEditingPlatform(p.platform); setEditValue(p.handle); }}
                              title="Click to fix this handle"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                              {status.error || "Invalid"} — click to fix
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">Not verified</span>
                        )}
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
                      <TableHead>Post</TableHead>
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
                        <TableRow
                          key={item.id}
                          className={item.url ? "cursor-pointer hover:bg-muted/50" : ""}
                          onClick={() => {
                            if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
                          }}
                        >
                          <TableCell className="capitalize">
                            {item.platform}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {item.contentType}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
                            {item.text || "—"}
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
                          <TableCell className="text-right flex items-center justify-end gap-1.5">
                            {formatNumber(item.views)}
                            {item.url && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            )}
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
          {(!fandom.influencersByEngagement || fandom.influencersByEngagement.length === 0) &&
           (!fandom.influencersByFollowers || fandom.influencersByFollowers.length === 0) ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">No influencer data available yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {fandom.influencersByEngagement && fandom.influencersByEngagement.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Top by Engagement</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {fandom.influencersByEngagement.map((inf) => {
                      const profileUrl = inf.profileUrl || getProfileUrl(inf.platform, inf.username);
                      return (
                        <a
                          key={inf.id}
                          href={profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block group"
                        >
                          <Card className="transition-colors group-hover:border-primary/40 group-hover:shadow-sm">
                            <CardContent className="pt-4">
                              <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                                  {inf.username.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-semibold text-sm">
                                      @{inf.username}
                                    </p>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                  </div>
                                  <p className="text-xs text-muted-foreground capitalize">
                                    {inf.platform}
                                  </p>
                                  <div className="grid grid-cols-3 gap-2 mt-2">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Followers</p>
                                      <p className="text-sm font-medium">{formatNumber(inf.followers)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Eng. Rate</p>
                                      <p className="text-sm font-medium">{inf.engagementRate}%</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Score</p>
                                      <p className="text-sm font-medium">{inf.relevanceScore}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {fandom.influencersByFollowers && fandom.influencersByFollowers.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Top by Followers</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {fandom.influencersByFollowers.map((inf) => {
                      const profileUrl = inf.profileUrl || getProfileUrl(inf.platform, inf.username);
                      return (
                        <a
                          key={inf.id}
                          href={profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block group"
                        >
                          <Card className="transition-colors group-hover:border-primary/40 group-hover:shadow-sm">
                            <CardContent className="pt-4">
                              <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                                  {inf.username.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-semibold text-sm">
                                      @{inf.username}
                                    </p>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                  </div>
                                  <p className="text-xs text-muted-foreground capitalize">
                                    {inf.platform}
                                  </p>
                                  <div className="grid grid-cols-3 gap-2 mt-2">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Followers</p>
                                      <p className="text-sm font-medium">{formatNumber(inf.followers)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Eng. Rate</p>
                                      <p className="text-sm font-medium">{inf.engagementRate}%</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Score</p>
                                      <p className="text-sm font-medium">{inf.relevanceScore}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
