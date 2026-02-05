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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { TierBadge } from "@/components/dashboard/tier-badge";
import { PlatformIcons } from "@/components/dashboard/platform-icon";
import type { FandomWithMetrics, ScrapeRun } from "@/types/fandom";

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
    useAIResearch: true,
    scrapeImmediately: true,
  });

  // Edit Fandom dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editingFandom, setEditingFandom] = useState<FandomWithMetrics | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    tier: "emerging" as "emerging" | "trending" | "existing",
    description: "",
    fandomGroup: "",
    demographicTags: [] as string[],
    platforms: [{ platform: "tiktok", handle: "" }] as Array<{ platform: string; handle: string }>,
  });

  // Scrape activity state
  const [scrapeRuns, setScrapeRuns] = useState<ScrapeRun[]>([]);
  const [globalScraping, setGlobalScraping] = useState(false);
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [insightsResult, setInsightsResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Untrack state
  const [untrackingSlug, setUntrackingSlug] = useState<string | null>(null);

  const fetchFandoms = useCallback(async () => {
    const data = await fetch("/api/fandoms").then((r) => r.json());
    setFandoms(data);
  }, []);

  const fetchScrapeRuns = useCallback(async () => {
    try {
      const data = await fetch("/api/scrape/status").then((r) => r.json());
      if (Array.isArray(data)) setScrapeRuns(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/fandoms").then((r) => r.json()),
      fetch("/api/settings/status").then((r) => r.json()),
      fetch("/api/scrape/status").then((r) => r.json()).catch(() => []),
    ])
      .then(([fandomData, statusData, runsData]) => {
        setFandoms(fandomData);
        setStatus(statusData);
        if (Array.isArray(runsData)) setScrapeRuns(runsData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Poll scrape status while any run is "running"
  useEffect(() => {
    const hasRunning = scrapeRuns.some((r) => r.status === "running");
    if (!hasRunning && !globalScraping) return;
    const interval = setInterval(fetchScrapeRuns, 10000);
    return () => clearInterval(interval);
  }, [scrapeRuns, globalScraping, fetchScrapeRuns]);

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
          name: formData.name,
          tier: formData.tier,
          description: formData.description,
          fandomGroup: formData.fandomGroup,
          demographicTags: formData.demographicTags,
          platforms: formData.platforms.filter((p) => p.handle.trim()),
          useAIResearch: formData.useAIResearch,
          scrapeImmediately: formData.scrapeImmediately,
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
        useAIResearch: true,
        scrapeImmediately: true,
      });
      await fetchFandoms();
      // Start polling scrape status if scrape was triggered
      if (formData.scrapeImmediately || formData.useAIResearch) {
        setTimeout(fetchScrapeRuns, 3000);
      }
    } catch {
      setAddError("Network error");
    } finally {
      setAddLoading(false);
    }
  }, [formData, fetchFandoms]);

  const openEditDialog = useCallback((fandom: FandomWithMetrics) => {
    setEditingFandom(fandom);
    setEditFormData({
      name: fandom.name,
      tier: fandom.tier,
      description: fandom.description || "",
      fandomGroup: fandom.fandomGroup || "",
      demographicTags: [...fandom.demographicTags],
      platforms: fandom.platforms.length > 0
        ? fandom.platforms.map((p) => ({ platform: p.platform, handle: p.handle }))
        : [{ platform: "tiktok", handle: "" }],
    });
    setEditError(null);
    setEditDialogOpen(true);
  }, []);

  const handleEditFandom = useCallback(async () => {
    if (!editingFandom) return;
    if (!editFormData.name.trim()) {
      setEditError("Name is required");
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/fandoms/${editingFandom.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editFormData,
          platforms: editFormData.platforms.filter((p) => p.handle.trim()),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error || "Failed to update fandom");
        return;
      }
      setEditDialogOpen(false);
      setEditingFandom(null);
      await fetchFandoms();
    } catch {
      setEditError("Network error");
    } finally {
      setEditLoading(false);
    }
  }, [editingFandom, editFormData, fetchFandoms]);

  const toggleEditDemographic = (tag: string) => {
    setEditFormData((prev) => ({
      ...prev,
      demographicTags: prev.demographicTags.includes(tag)
        ? prev.demographicTags.filter((t) => t !== tag)
        : [...prev.demographicTags, tag],
    }));
  };

  const addEditPlatformRow = () => {
    setEditFormData((prev) => ({
      ...prev,
      platforms: [...prev.platforms, { platform: "tiktok", handle: "" }],
    }));
  };

  const removeEditPlatformRow = (index: number) => {
    setEditFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.filter((_, i) => i !== index),
    }));
  };

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

  const handleUntrack = useCallback(
    async (slug: string) => {
      setUntrackingSlug(slug);
      try {
        const res = await fetch(`/api/fandoms/untrack?slug=${slug}`, {
          method: "POST",
        });
        if (res.ok) {
          await fetchFandoms();
        }
      } finally {
        setUntrackingSlug(null);
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

  const handleBatchScrape = useCallback(
    async (slug: string) => {
      setScrapingSlug(slug);
      setScrapeResult(null);
      try {
        const res = await fetch("/api/scrape/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fandomSlug: slug }),
        });
        const data = await res.json();
        if (res.ok) {
          setScrapeResult({
            slug,
            success: true,
            message: "All platforms scrape started",
          });
          // Start polling
          setTimeout(fetchScrapeRuns, 3000);
        } else {
          setScrapeResult({
            slug,
            success: false,
            message: data.error || "Batch scrape failed",
          });
        }
      } catch {
        setScrapeResult({ slug, success: false, message: "Network error" });
      } finally {
        setScrapingSlug(null);
      }
    },
    [fetchScrapeRuns]
  );

  const handleGenerateInsights = useCallback(async () => {
    setGeneratingInsights(true);
    setInsightsResult(null);
    try {
      const res = await fetch("/api/fandoms/generate-insights", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setInsightsResult({
          success: true,
          message: `Generated insights for ${data.succeeded}/${data.total} fandoms`,
        });
        await fetchFandoms();
      } else {
        setInsightsResult({
          success: false,
          message: data.error || "Failed to generate insights",
        });
      }
    } catch {
      setInsightsResult({ success: false, message: "Network error" });
    } finally {
      setGeneratingInsights(false);
    }
  }, [fetchFandoms]);

  const handleGlobalScrape = useCallback(async () => {
    setGlobalScraping(true);
    try {
      await fetch("/api/scrape/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setTimeout(fetchScrapeRuns, 3000);
    } catch {
      // ignore
    }
  }, [fetchScrapeRuns]);

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
          <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateInsights}
            disabled={generatingInsights}
          >
            {generatingInsights ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            )}
            {generatingInsights ? "Generating..." : "Generate AI Insights"}
          </Button>
          {insightsResult && (
            <span className={`text-xs ${insightsResult.success ? "text-emerald-600" : "text-red-500"}`}>
              {insightsResult.message}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleGlobalScrape}
            disabled={globalScraping || !status?.apify.configured}
          >
            {globalScraping ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>
            )}
            {globalScraping ? "Scraping..." : "Scrape All Fandoms"}
          </Button>
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
                  {formData.useAIResearch
                    ? "Enter the fandom name and AI will research everything else."
                    : "Add a fandom to track across social media platforms."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fandom-name">Fandom Name *</Label>
                  <Input
                    id="fandom-name"
                    placeholder="e.g. BINI Blooms, SB19 A'TIN, Alamat Tribe"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>

                <div className="flex items-center gap-2 p-3 rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
                  <Checkbox
                    id="use-ai-research"
                    checked={formData.useAIResearch}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        useAIResearch: checked === true,
                      }))
                    }
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="use-ai-research"
                      className="text-sm font-medium cursor-pointer flex items-center gap-1.5"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                      Use AI to research fandom details
                    </Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      AI will find social handles, follower counts, demographics, and generate insights.
                    </p>
                  </div>
                </div>

                {!formData.useAIResearch && (
                  <>
                    <div className="space-y-2">
                      <Label>Tier *</Label>
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
                        <Label>Platforms *</Label>
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
                  </>
                )}

                {formData.useAIResearch && (
                  <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                    <p className="font-medium mb-1">AI will automatically:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Search for the fandom&apos;s social media accounts</li>
                      <li>Verify follower counts via Apify</li>
                      <li>Determine tier and demographics</li>
                      <li>Generate description and insights</li>
                      <li>Start collecting engagement data</li>
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Checkbox
                    id="scrape-immediately"
                    checked={formData.scrapeImmediately}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        scrapeImmediately: checked === true,
                      }))
                    }
                  />
                  <Label
                    htmlFor="scrape-immediately"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Scrape data immediately after adding
                  </Label>
                </div>
                <p className="text-[10px] text-muted-foreground -mt-2">
                  {formData.useAIResearch
                    ? "After AI finds handles, immediately start collecting social media data."
                    : "When enabled, starts collecting social media data from configured platforms right away."}
                </p>

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
                  {addLoading
                    ? formData.useAIResearch
                      ? "Researching..."
                      : "Adding..."
                    : formData.useAIResearch
                      ? "Research & Add"
                      : "Add Fandom"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Fandom</DialogTitle>
                <DialogDescription>
                  Update fandom details and platform handles.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-fandom-name">Name</Label>
                  <Input
                    id="edit-fandom-name"
                    value={editFormData.name}
                    onChange={(e) =>
                      setEditFormData((prev) => ({ ...prev, name: e.target.value }))
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
                        variant={editFormData.tier === t ? "default" : "outline"}
                        onClick={() =>
                          setEditFormData((prev) => ({ ...prev, tier: t }))
                        }
                        className="text-xs capitalize"
                      >
                        {t}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-fandom-group">Group</Label>
                  <Input
                    id="edit-fandom-group"
                    placeholder="e.g. P-Pop, K-Pop, Reality TV"
                    value={editFormData.fandomGroup}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        fandomGroup: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-fandom-desc">Description</Label>
                  <Input
                    id="edit-fandom-desc"
                    placeholder="Brief description..."
                    value={editFormData.description}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
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
                          editFormData.demographicTags.includes(tag)
                            ? "default"
                            : "outline"
                        }
                        onClick={() => toggleEditDemographic(tag)}
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
                      onClick={addEditPlatformRow}
                      className="text-xs h-6"
                    >
                      + Add Platform
                    </Button>
                  </div>
                  {editFormData.platforms.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select
                        value={p.platform}
                        onChange={(e) =>
                          setEditFormData((prev) => ({
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
                          setEditFormData((prev) => ({
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
                      {editFormData.platforms.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeEditPlatformRow(i)}
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

                {editError && (
                  <p className="text-sm text-red-500">{editError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                  disabled={editLoading}
                >
                  Cancel
                </Button>
                <Button onClick={handleEditFandom} disabled={editLoading}>
                  {editLoading ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={scrapingSlug === f.slug || !status?.apify.configured}
                          >
                            {scrapingSlug === f.slug ? (
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>
                            )}
                            <span className="ml-1 text-xs">
                              {scrapingSlug === f.slug ? "Scraping..." : "Scrape"}
                            </span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1"><path d="m6 9 6 6 6-6"/></svg>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleBatchScrape(f.slug)}>
                            All Platforms
                          </DropdownMenuItem>
                          {f.platforms.map((p) => (
                            <DropdownMenuItem
                              key={p.platform}
                              onClick={() => handleScrape(f.slug, p.platform)}
                            >
                              <span className="capitalize">{p.platform}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => openEditDialog(f)}
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
                          <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                          <path d="m15 5 4 4" />
                        </svg>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-violet-600"
                        title="Back to Discover"
                        disabled={untrackingSlug === f.slug}
                        onClick={() => handleUntrack(f.slug)}
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
                          <circle cx="12" cy="12" r="10" />
                          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
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

      {scrapeRuns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Scrape Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fandom</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scrapeRuns.slice(0, 50).map((run) => {
                  const duration =
                    run.startedAt && run.finishedAt
                      ? Math.round(
                          (new Date(run.finishedAt).getTime() -
                            new Date(run.startedAt).getTime()) /
                            1000
                        )
                      : null;
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="text-sm">
                        {run.fandomName || "—"}
                      </TableCell>
                      <TableCell className="text-xs capitalize">
                        {run.platform || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            run.status === "succeeded"
                              ? "text-emerald-600 border-emerald-200"
                              : run.status === "running"
                                ? "text-amber-600 border-amber-200"
                                : run.status === "failed"
                                  ? "text-red-500 border-red-200"
                                  : "text-muted-foreground"
                          }`}
                        >
                          {run.status === "running" && (
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                          )}
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {run.itemsCount}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {duration !== null ? `${duration}s` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
                  <span>All Data (Cron)</span>
                  <Badge variant="outline" className="text-[10px]">
                    Every 12 hours
                  </Badge>
                </div>
                <p className="text-[10px] pt-1">
                  Automated cron scrapes all fandoms and platforms every 12 hours.
                  Use the manual buttons above for immediate refreshes.
                </p>
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
