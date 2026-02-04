"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { DiscoveredFandomCard } from "@/components/dashboard/discovered-fandom-card";
import { Button } from "@/components/ui/button";
import { useSegment } from "@/lib/context/segment-context";
import type { DiscoveredFandom } from "@/types/fandom";

const segmentDemoMap: Record<string, string[]> = {
  postpaid: ["abc"],
  prepaid: ["cde"],
};

export default function DiscoverPage() {
  const { segment } = useSegment();
  const [fandoms, setFandoms] = useState<DiscoveredFandom[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkActioning, setBulkActioning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCountRef = useRef<number>(0);

  const fetchDiscovered = useCallback(async () => {
    try {
      const res = await fetch("/api/discover");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setFandoms(data);
      setSelected(new Set());
      return data.length as number;
    } catch {
      setError("Failed to load discovered fandoms");
      return 0;
    } finally {
      setLoading(false);
    }
  }, []);

  const checkDiscoveryStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/discover?status");
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "running") {
        setDiscovering(true);
      } else {
        setDiscovering(false);
      }
      return data.status as string;
    } catch {
      return "idle";
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const status = await checkDiscoveryStatus();
      if (status !== "running") {
        // Discovery finished — fetch results and stop polling
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        const count = await fetchDiscovered();
        if (count > prevCountRef.current) {
          // New fandoms were added
        }
        setDiscovering(false);
      }
    }, 3000);
  }, [checkDiscoveryStatus, fetchDiscovered]);

  // On mount: fetch fandoms and check if discovery is already running
  useEffect(() => {
    const init = async () => {
      const count = await fetchDiscovered();
      prevCountRef.current = count;
      const status = await checkDiscoveryStatus();
      if (status === "running") {
        setDiscovering(true);
        startPolling();
      }
    };
    init();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [fetchDiscovered, checkDiscoveryStatus, startPolling]);

  const handleDiscover = async () => {
    setDiscovering(true);
    setError(null);
    prevCountRef.current = fandoms.length;
    try {
      const res = await fetch("/api/discover", { method: "POST" });
      if (!res.ok && res.status !== 202) {
        const data = await res.json();
        throw new Error(data.error || "Discovery failed");
      }
      // Start polling for completion
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed");
      setDiscovering(false);
    }
  };

  const handleTrack = async (id: string) => {
    const res = await fetch(`/api/discover/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "track" }),
    });
    if (!res.ok) throw new Error("Failed to track fandom");
    setFandoms((prev) => prev.filter((f) => f.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleDismiss = async (id: string) => {
    const res = await fetch(`/api/discover/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
    if (!res.ok) throw new Error("Failed to dismiss fandom");
    setFandoms((prev) => prev.filter((f) => f.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleSelect = (id: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const filteredFandoms = useMemo(() => {
    if (segment === "all") return fandoms;
    const tags = segmentDemoMap[segment];
    if (!tags) return fandoms;
    return fandoms.filter((f) =>
      tags.some((tag) => f.suggestedDemographics.includes(tag))
    );
  }, [fandoms, segment]);

  const handleSelectAll = () => {
    if (selected.size === filteredFandoms.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredFandoms.map((f) => f.id)));
    }
  };

  const handleBulkAction = async (action: "clear" | "dismiss") => {
    if (selected.size === 0) return;
    setBulkActioning(true);
    try {
      const res = await fetch("/api/discover", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
      if (!res.ok) throw new Error("Bulk action failed");
      setFandoms((prev) => prev.filter((f) => !selected.has(f.id)));
      setSelected(new Set());
    } catch {
      setError("Failed to process selected fandoms");
    } finally {
      setBulkActioning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Discover Fandoms</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered discovery of Philippine fandoms not yet tracked. Evaluated on size, sustainability, and growth potential.
          </p>
        </div>
        <Button
          onClick={handleDiscover}
          disabled={discovering}
          className="shrink-0"
        >
          {discovering ? (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-spin mr-2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Discovering...
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2"
              >
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
              Discover New Fandoms
            </>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-spin text-muted-foreground"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredFandoms.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          </div>
          <h3 className="font-semibold text-lg">No Discovered Fandoms Yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Click &quot;Discover New Fandoms&quot; to use AI to research and surface Philippine fandoms
            that aren&apos;t currently being tracked.
          </p>
        </div>
      )}

      {/* Select All / Count bar */}
      {!loading && filteredFandoms.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSelectAll}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {selected.size === filteredFandoms.length ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            ) : selected.size > 0 ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M8 12h8" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
              </svg>
            )}
            {selected.size === 0
              ? "Select all"
              : selected.size === filteredFandoms.length
                ? "Deselect all"
                : `${selected.size} selected`}
          </button>
        </div>
      )}

      {/* Card Grid */}
      {!loading && filteredFandoms.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredFandoms.map((fandom) => (
            <DiscoveredFandomCard
              key={fandom.id}
              fandom={fandom}
              selected={selected.has(fandom.id)}
              onSelect={handleSelect}
              onTrack={handleTrack}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg">
            <span className="text-sm font-medium">
              {selected.size} fandom{selected.size > 1 ? "s" : ""} selected
            </span>
            <div className="h-4 w-px bg-border" />
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActioning}
              onClick={() => handleBulkAction("clear")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Clear (can re-discover)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              disabled={bulkActioning}
              onClick={() => handleBulkAction("dismiss")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
              Dismiss permanently
            </Button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-1 text-muted-foreground hover:text-foreground"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
