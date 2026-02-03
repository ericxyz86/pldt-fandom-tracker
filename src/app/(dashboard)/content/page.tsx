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
                  <TableHead>Platform</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Likes</TableHead>
                  <TableHead className="text-right">Comments</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 15).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-xs">
                      {item.fandomName}
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
                    <TableCell className="text-right text-xs">
                      {formatNumber(item.views)}
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
