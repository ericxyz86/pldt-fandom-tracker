"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface RegionalData {
  regionCode: string;
  regionName: string;
  interestValue: number;
}

interface RegionalMapProps {
  fandomId: string;
  fandomName: string;
}

/**
 * Philippine Regional Heat Map
 * Shows fandom interest strength by province/region
 */
export function RegionalMap({ fandomId, fandomName }: RegionalMapProps) {
  const [regions, setRegions] = useState<RegionalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRegionalData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/regional-trends?fandomId=${fandomId}`);
        if (!res.ok) throw new Error("Failed to fetch regional data");
        const data = await res.json();
        setRegions(data.regions || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchRegionalData();
  }, [fandomId]);

  // Color scale: 0-100 → hsl(0, 70%, lightness)
  // 0 = very light, 100 = deep red
  const getColor = (value: number) => {
    if (value === 0) return "#f3f4f6"; // gray-100 for no data
    const lightness = 90 - (value * 0.5); // 90% (light) → 40% (dark)
    return `hsl(0, 70%, ${lightness}%)`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Geographic Distribution</CardTitle>
          <CardDescription>Loading regional data...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error || regions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Geographic Distribution</CardTitle>
          <CardDescription>
            {error || "No regional data available. Run regional scrape to collect data."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const maxValue = Math.max(...regions.map((r) => r.interestValue), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Geographic Distribution</CardTitle>
        <CardDescription>
          Search interest for <strong>{fandomName}</strong> by Philippine region
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Regional Rankings Table */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Top Regions</h3>
            <div className="space-y-2">
              {regions.slice(0, 10).map((region, idx) => (
                <div key={region.regionCode} className="flex items-center gap-3">
                  <div className="w-8 text-sm text-muted-foreground text-right">
                    #{idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{region.regionName}</span>
                      <span className="text-sm font-semibold text-muted-foreground">
                        {region.interestValue}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(region.interestValue / maxValue) * 100}%`,
                          backgroundColor: getColor(region.interestValue),
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Heat Map Legend */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Interest Level</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Low</span>
              <div className="flex-1 h-4 rounded-full overflow-hidden flex">
                {[0, 20, 40, 60, 80, 100].map((val) => (
                  <div
                    key={val}
                    className="flex-1"
                    style={{ backgroundColor: getColor(val) }}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">High</span>
            </div>
          </div>

          {/* Campaign Insights */}
          {regions.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold">📍 Campaign Targeting</h3>
              <p className="text-sm text-muted-foreground">
                <strong>{fandomName}</strong> has strongest presence in{" "}
                <strong>{regions[0].regionName}</strong> ({regions[0].interestValue}/100)
                {regions.length > 1 && (
                  <>
                    , followed by <strong>{regions[1].regionName}</strong> (
                    {regions[1].interestValue}/100)
                  </>
                )}
                {regions.length > 2 && (
                  <>
                    {" "}
                    and <strong>{regions[2].regionName}</strong> (
                    {regions[2].interestValue}/100)
                  </>
                )}
                .
              </p>
              <p className="text-sm text-muted-foreground">
                Focus PLDT campaigns in these high-interest regions for maximum fandom engagement.
              </p>
            </div>
          )}

          {/* All Regions List */}
          {regions.length > 10 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Show all {regions.length} regions
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {regions.slice(10).map((region) => (
                  <div
                    key={region.regionCode}
                    className="flex justify-between text-xs p-2 bg-muted/30 rounded"
                  >
                    <span>{region.regionName}</span>
                    <span className="font-semibold">{region.interestValue}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
