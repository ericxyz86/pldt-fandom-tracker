"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/utils/format";
import { PlatformIcon } from "@/components/dashboard/platform-icon";
import { AIInsightCard } from "@/components/dashboard/ai-insight-card";
import type { Platform, ContentItem } from "@/types/fandom";

interface ContentWithFandom extends ContentItem {
  fandomName: string;
}

export default function ContentPage() {
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [allContent, setAllContent] = useState<ContentWithFandom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/content")
      .then((r) => r.json())
      .then((data) => {
        setAllContent(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = allContent;
    if (platformFilter !== "all") {
      result = result.filter((c) => c.platform === platformFilter);
    }
    return result.sort((a, b) => b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares));
  }, [allContent, platformFilter]);

  const hashtagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allContent.forEach((c) =>
      c.hashtags.forEach((h) => {
        counts[h] = (counts[h] || 0) + 1;
      })
    );
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [allContent]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content Analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Top-performing content across all tracked fandoms
        </p>
      </div>

      <AIInsightCard
        page="content"
        sections={[
          { label: "Summary", key: "summary" },
          { label: "Top Themes", key: "topPerformingThemes" },
          { label: "Platform Breakdown", key: "platformBreakdown" },
          { label: "Recommendation", key: "recommendation" },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Top Content</CardTitle>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-[130px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="twitter">Twitter/X</SelectItem>
                <SelectItem value="reddit">Reddit</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fandom</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Likes</TableHead>
                  <TableHead className="text-right">Comments</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 15).map((item) => (
                  <TableRow
                    key={item.id}
                    className={item.url ? "cursor-pointer hover:bg-muted/50" : ""}
                    onClick={() => {
                      if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <TableCell className="font-medium text-xs">
                      {item.fandomName}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {item.text || "—"}
                    </TableCell>
                    <TableCell>
                      <PlatformIcon platform={item.platform as Platform} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {item.contentType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {formatNumber(item.likes)}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {formatNumber(item.comments)}
                    </TableCell>
                    <TableCell className="text-right text-xs flex items-center justify-end gap-1.5">
                      {formatNumber(item.views)}
                      {item.url && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top Hashtags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {hashtagCounts.map(([tag, count]) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs"
                >
                  #{tag}
                  <span className="ml-1 text-muted-foreground">{count}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
