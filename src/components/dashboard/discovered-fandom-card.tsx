"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TierBadge } from "./tier-badge";
import { PlatformIcons } from "./platform-icon";
import type { DiscoveredFandom, Platform } from "@/types/fandom";

interface DiscoveredFandomCardProps {
  fandom: DiscoveredFandom;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onTrack: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color =
    score >= 60
      ? "bg-emerald-500"
      : score >= 30
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
        <span className="text-[10px] font-semibold">{score}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={`h-1.5 rounded-full transition-all ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function formatDemographic(tag: string): string {
  if (tag === "gen_z") return "Gen Z";
  if (tag === "gen_y") return "Gen Y";
  return tag.toUpperCase();
}

export function DiscoveredFandomCard({ fandom, selected, onSelect, onTrack, onDismiss }: DiscoveredFandomCardProps) {
  const [tracking, setTracking] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const platforms = fandom.suggestedPlatforms.filter(
    (p): p is Platform =>
      ["instagram", "tiktok", "facebook", "youtube", "twitter", "reddit"].includes(p)
  );

  const handleTrack = async () => {
    setTracking(true);
    try {
      await onTrack(fandom.id);
    } finally {
      setTracking(false);
    }
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await onDismiss(fandom.id);
    } finally {
      setDismissing(false);
    }
  };

  return (
    <Card className={`flex flex-col transition-colors ${selected ? "border-primary/50 bg-primary/[0.02]" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onSelect(fandom.id, !selected)}
            className="mt-0.5 shrink-0"
          >
            {selected ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                <rect width="18" height="18" x="3" y="3" rx="2" />
              </svg>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">{fandom.name}</h3>
            {fandom.fandomGroup && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {fandom.fandomGroup}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TierBadge tier={fandom.suggestedTier} />
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
              {fandom.overallScore}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {fandom.description}
        </p>

        {/* Score Bars */}
        <div className="space-y-2">
          <ScoreBar label="Size" score={fandom.sizeScore} />
          <ScoreBar label="Sustainability" score={fandom.sustainabilityScore} />
          <ScoreBar label="Growth" score={fandom.growthScore} />
        </div>

        {/* Estimated Size */}
        <div>
          <p className="text-[10px] text-muted-foreground font-medium">Estimated Size</p>
          <p className="text-xs">{fandom.estimatedSize}</p>
        </div>

        {/* Platforms */}
        {platforms.length > 0 && (
          <div className="flex items-center gap-1.5">
            <PlatformIcons platforms={platforms} />
          </div>
        )}

        {/* Demographics */}
        {fandom.suggestedDemographics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {fandom.suggestedDemographics.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                {formatDemographic(tag)}
              </Badge>
            ))}
          </div>
        )}

        {/* Qualitative Sections */}
        <div className="border-t pt-2 space-y-1.5">
          <div>
            <p className="text-[10px] text-muted-foreground font-medium">Key Behavior</p>
            <p className="text-xs">{fandom.keyBehavior}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-medium">Engagement Potential</p>
            <p className="text-xs">{fandom.engagementPotential}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-medium">Community Tone</p>
            <p className="text-xs">{fandom.communityTone}</p>
          </div>
        </div>

        {/* Rationale */}
        <div className="rounded-md bg-muted/50 p-2.5">
          <p className="text-[10px] text-muted-foreground font-medium mb-1">Why PLDT Should Consider</p>
          <p className="text-xs text-muted-foreground">{fandom.rationale}</p>
        </div>

        {/* Handles note */}
        {fandom.suggestedHandles.length > 0 && (
          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
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
              className="shrink-0 mt-0.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="16" y2="12" />
              <line x1="12" x2="12.01" y1="8" y2="8" />
            </svg>
            <span>Platform handles are AI-suggested and should be verified before scraping</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1"
            onClick={handleTrack}
            disabled={tracking || dismissing}
          >
            {tracking ? (
              <>
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
                  className="animate-spin mr-1"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Tracking...
              </>
            ) : (
              <>
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
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Track This Fandom
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            disabled={tracking || dismissing}
          >
            {dismissing ? "..." : "Dismiss"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
