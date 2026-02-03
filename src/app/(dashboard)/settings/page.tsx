"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMockFandoms } from "@/lib/data/mock";
import { TierBadge } from "@/components/dashboard/tier-badge";
import { PlatformIcons } from "@/components/dashboard/platform-icon";

export default function SettingsPage() {
  const fandoms = useMemo(() => getMockFandoms(), []);

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
                    <Button size="sm" variant="ghost">
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
                      <span className="ml-1 text-xs">Scrape</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Data Pipeline Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-md border p-4">
              <h4 className="text-sm font-medium mb-2">
                Scrape Schedule
              </h4>
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
              <h4 className="text-sm font-medium mb-2">
                API Configuration
              </h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Apify Token</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] text-amber-600"
                  >
                    Not configured
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Database</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] text-amber-600"
                  >
                    Not connected
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
