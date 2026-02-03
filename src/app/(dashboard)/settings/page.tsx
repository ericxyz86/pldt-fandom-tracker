"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TierBadge } from "@/components/dashboard/tier-badge";
import { PlatformIcons } from "@/components/dashboard/platform-icon";
import type { FandomWithMetrics, FandomDiscovery } from "@/types/fandom";

interface PipelineStatus {
  apify: {
    configured: boolean;
    tokenPrefix: string | null;
  };
  database: {
    connected: boolean;
    url: string | null;
    fandomCount: number;
  };
}

const TIER_OPTIONS = ["emerging", "trending", "existing"] as const;
const PLATFORM_OPTIONS = ["tiktok", "instagram", "twitter", "youtube", "facebook", "reddit"] as const;
const DEMOGRAPHIC_OPTIONS = ["gen_z", "gen_y", "abc", "cde"] as const;

export default function SettingsPage() {
  const [fandoms, setFandoms] = useState<FandomWithMetrics[]>([]);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrapingSlug, setScrapingSlug] = useState<string | null>(null);
  const [scrapeResult, setScrapeResult] = useState<{
    slug: string;
    success: boolean;
    message: string;
  } | null>(null);

  // Add Fandom dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    tier: "emerging" as "emerging" | "trending" | "existing",
    description: "",
    fandomGroup: "",
    demographicTags: [] as string[],
    platforms: [{ platform: "tiktok", handle: "" }] as Array<{ platform: string; handle: string }>,
  });

  // Delete state
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  // Discovery state
  const [discoveries, setDiscoveries] = useState<FandomDiscovery[]>([]);
  const [discoveriesLoading, setDiscoveriesLoading] = useState(false);
  const [addingDiscovery, setAddingDiscovery] = useState<string | null>(null);

  const fetchFandoms = useCallback(async () => {
    const data = await fetch("/api/fandoms").then((r) => r.json());
    setFandoms(data);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/fandoms").then((r) => r.json()),
      fetch("/api/settings/status").then((r) => r.json()),
    ])
      .then(([fandomData, statusData]) => {
        setFandoms(fandomData);
        setStatus(statusData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAddFandom = useCallback(async () => {
    if (!formData.name.trim()) {
      setAddError("Name is required");
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch("/api/fandoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          platforms: formData.platforms.filter((p) => p.handle.trim()),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAddError(data.error || "Failed to add fandom");
        return;
      }
      setDialogOpen(false);
      setFormData({
        name: "",
        tier: "emerging",
        description: "",
        fandomGroup: "",
        demographicTags: [],
        platforms: [{ platform: "tiktok", handle: "" }],
      });
      await fetchFandoms();
    } catch {
      setAddError("Network error");
    } finally {
      setAddLoading(false);
    }
  }, [formData, fetchFandoms]);

  const handleDelete = useCallback(
    async (slug: string) => {
      setDeletingSlug(slug);
      try {
        const res = await fetch(`/api/fandoms?slug=${slug}`, {
          method: "DELETE",
        });
        if (res.ok) {
          await fetchFandoms();
        }
      } finally {
        setDeletingSlug(null);
      }
    },
    [fetchFandoms]
  );

  const toggleDemographic = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      demographicTags: prev.demographicTags.includes(tag)
        ? prev.demographicTags.filter((t) => t !== tag)
        : [...prev.demographicTags, tag],
    }));
  };

  const addPlatformRow = () => {
    setFormData((prev) => ({
      ...prev,
      platforms: [...prev.platforms, { platform: "tiktok", handle: "" }],
    }));
  };

  const removePlatformRow = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.filter((_, i) => i !== index),
    }));
  };

  const loadDiscoveries = useCallback(async () => {
    setDiscoveriesLoading(true);
    try {
      const data = await fetch("/api/discoveries").then((r) => r.json());
      if (Array.isArray(data)) setDiscoveries(data);
    } finally {
      setDiscoveriesLoading(false);
    }
  }, []);

  const handleAddDiscovery = useCallback(
    async (d: FandomDiscovery) => {
      setAddingDiscovery(d.name);
      try {
        const res = await fetch("/api/fandoms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: d.name,
            tier: d.suggestedTier,
            description: `Auto-discovered from ${d.source} analysis (${d.occurrences} occurrences)`,
            fandomGroup: d.suggestedGroup,
            demographicTags: [],
            platforms: [{ platform: d.platform, handle: d.name }],
          }),
        });
        if (res.ok) {
          setDiscoveries((prev) => prev.filter((dd) => dd.name !== d.name));
          await fetchFandoms();
        }
      } finally {
        setAddingDiscovery(null);
      }
    },
    [fetchFandoms]
  );

  const handleScrape = useCallback(
    async (slug: string, platform: string) => {
      setScrapingSlug(slug);
      setScrapeResult(null);
      try {
        const res = await fetch("/api/scrape/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fandomSlug: slug, platform }),
        });
        const data = await res.json();
        if (res.ok) {
          setScrapeResult({
            slug,
            success: true,
            message: `Scrape started (${data.itemsCount ?? 0} items)`,
          });
        } else {
          setScrapeResult({
            slug,
            success: false,
            message: data.error || "Scrape failed",
          });
        }
      } catch {
        setScrapeResult({
          slug,
          success: false,
          message: "Network error",
        });
      } finally {
        setScrapingSlug(null);
      }
    },
    []
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage tracked fandoms and data scraping configuration
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Tracked Fandoms</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-1"
                >
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
                Add Fandom
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Fandom</DialogTitle>
                <DialogDescription>
                  Add a fandom to track across social media platforms.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fandom-name">Name</Label>
                  <Input
                    id="fandom-name"
                    placeholder="e.g. BINI Blooms"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tier</Label>
                  <div className="flex gap-2">
                    {TIER_OPTIONS.map((t) => (
                      <Button
                        key={t}
                        type="button"
                        size="sm"
                        variant={formData.tier === t ? "default" : "outline"}
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, tier: t }))
                        }
                        className="text-xs capitalize"
                      >
                        {t}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fandom-group">Group</Label>
                  <Input
                    id="fandom-group"
                    placeholder="e.g. P-Pop, K-Pop, Reality TV"
                    value={formData.fandomGroup}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        fandomGroup: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fandom-desc">Description</Label>
                  <Input
                    id="fandom-desc"
                    placeholder="Brief description..."
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Demographics</Label>
                  <div className="flex flex-wrap gap-2">
                    {DEMOGRAPHIC_OPTIONS.map((tag) => (
                      <Button
                        key={tag}
                        type="button"
                        size="sm"
                        variant={
                          formData.demographicTags.includes(tag)
                            ? "default"
                            : "outline"
                        }
                        onClick={() => toggleDemographic(tag)}
                        className="text-xs"
                      >
                        {tag === "gen_z"
                          ? "Gen Z"
                          : tag === "gen_y"
                            ? "Gen Y"
                            : tag.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Platforms</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={addPlatformRow}
                      className="text-xs h-6"
                    >
                      + Add Platform
                    </Button>
                  </div>
                  {formData.platforms.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select
                        value={p.platform}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            platforms: prev.platforms.map((pp, pi) =>
                              pi === i
                                ? { ...pp, platform: e.target.value }
                                : pp
                            ),
                          }))
                        }
                        className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                      >
                        {PLATFORM_OPTIONS.map((pl) => (
                          <option key={pl} value={pl}>
                            {pl}
                          </option>
                        ))}
                      </select>
                      <Input
                        placeholder="Handle (e.g. @username)"
                        value={p.handle}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            platforms: prev.platforms.map((pp, pi) =>
                              pi === i
                                ? { ...pp, handle: e.target.value }
                                : pp
                            ),
                          }))
                        }
                        className="text-xs"
                      />
                      {formData.platforms.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removePlatformRow(i)}
                          className="h-9 w-9 p-0 shrink-0"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {addError && (
                  <p className="text-sm text-red-500">{addError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={addLoading}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddFandom} disabled={addLoading}>
                  {addLoading ? "Adding..." : "Add Fandom"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fandom</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Platforms</TableHead>
                <TableHead>Demographics</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fandoms.map((f) => (
                <TableRow key={f.slug}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>
                    <TierBadge tier={f.tier} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {f.fandomGroup}
                  </TableCell>
                  <TableCell>
                    <PlatformIcons
                      platforms={f.platforms.map((p) => p.platform)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {f.demographicTags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[10px] px-1"
                        >
                          {tag === "gen_z"
                            ? "Gen Z"
                            : tag === "gen_y"
                              ? "Gen Y"
                              : tag.toUpperCase()}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {scrapeResult?.slug === f.slug && (
                        <span
                          className={`text-[10px] ${
                            scrapeResult.success
                              ? "text-emerald-600"
                              : "text-red-500"
                          }`}
                        >
                          {scrapeResult.message}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={scrapingSlug === f.slug || !status?.apify.configured}
                        onClick={() =>
                          handleScrape(
                            f.slug,
                            f.platforms[0]?.platform || "tiktok"
                          )
                        }
                      >
                        {scrapingSlug === f.slug ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="animate-spin"
                          >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                            <path d="M16 16h5v5" />
                          </svg>
                        )}
                        <span className="ml-1 text-xs">
                          {scrapingSlug === f.slug ? "Scraping..." : "Scrape"}
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-red-500"
                        disabled={deletingSlug === f.slug}
                        onClick={() => handleDelete(f.slug)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Fandom Discovery</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={loadDiscoveries}
            disabled={discoveriesLoading}
          >
            {discoveriesLoading ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-1 animate-spin"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-1"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            )}
            Scan for New Fandoms
          </Button>
        </CardHeader>
        <CardContent>
          {discoveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Click &quot;Scan for New Fandoms&quot; to analyze scraped content for
              untracked fandom communities. The system examines hashtags,
              mentions, and content patterns across all platforms.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Occurrences</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discoveries.map((d) => (
                  <TableRow key={d.name}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {d.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{d.platform}</TableCell>
                    <TableCell className="text-xs">{d.occurrences}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          d.confidence >= 60
                            ? "text-emerald-600 border-emerald-200"
                            : d.confidence >= 30
                              ? "text-amber-600 border-amber-200"
                              : "text-muted-foreground"
                        }`}
                      >
                        {d.confidence}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {d.suggestedGroup}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={addingDiscovery === d.name}
                        onClick={() => handleAddDiscovery(d)}
                      >
                        {addingDiscovery === d.name ? "Adding..." : "Track"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Data Pipeline Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-md border p-4">
              <h4 className="text-sm font-medium mb-2">Scrape Schedule</h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Profile Stats</span>
                  <Badge variant="outline" className="text-[10px]">
                    Every 6 hours
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Content / Posts</span>
                  <Badge variant="outline" className="text-[10px]">
                    Every 12 hours
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Google Trends</span>
                  <Badge variant="outline" className="text-[10px]">
                    Daily
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Influencer Discovery</span>
                  <Badge variant="outline" className="text-[10px]">
                    Weekly
                  </Badge>
                </div>
              </div>
            </div>

            <div className="rounded-md border p-4">
              <h4 className="text-sm font-medium mb-2">API Configuration</h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Apify Token</span>
                  {status?.apify.configured ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-600 border-emerald-200"
                    >
                      {status.apify.tokenPrefix}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-amber-600"
                    >
                      Not configured
                    </Badge>
                  )}
                </div>
                <div className="flex justify-between">
                  <span>Database</span>
                  {status?.database.connected ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-600 border-emerald-200"
                    >
                      Connected ({status.database.fandomCount} fandoms)
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-amber-600"
                    >
                      Not connected
                    </Badge>
                  )}
                </div>
                {status?.database.url && (
                  <div className="flex justify-between">
                    <span>DB Host</span>
                    <span className="font-mono text-[10px]">
                      {status.database.url}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
