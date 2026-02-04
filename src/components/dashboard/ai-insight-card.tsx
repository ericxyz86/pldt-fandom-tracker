"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InsightSection {
  label: string;
  key: string;
}

interface AIInsightCardProps {
  page: "trends" | "content" | "influencers";
  sections: InsightSection[];
}

interface InsightData {
  page: string;
  insights: Record<string, string>;
  generatedAt: string;
}

export function AIInsightCard({ page, sections }: AIInsightCardProps) {
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/insights/${page}`)
      .then((r) => r.json())
      .then((result) => {
        if (result && result.insights) setData(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page]);

  if (loading || !data) return null;

  const formattedDate = new Date(data.generatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Card className="border-blue-200/50 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 dark:from-blue-950/20 dark:to-indigo-950/10 dark:border-blue-800/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
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
              className="text-blue-600 dark:text-blue-400"
            >
              <path d="M12 2a4 4 0 0 0-4 4c0 4.5 4 6 4 12a4 4 0 0 0 4-4c0-4.5-4-6-4-12Z" />
              <path d="M12 2a4 4 0 0 1 4 4c0 4.5-4 6-4 12" />
            </svg>
            AI Insights
          </CardTitle>
          <span className="text-[10px] text-muted-foreground">
            Generated {formattedDate}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((section) => {
            const value = data.insights[section.key];
            if (!value) return null;
            return (
              <div key={section.key}>
                <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">
                  {section.label}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {value}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
