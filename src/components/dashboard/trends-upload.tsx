"use client";

import { useCallback, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface UploadResult {
  success: boolean;
  inserted: number;
  matched: string[];
  unmatched: string[];
  dateRange: string;
  error?: string;
}

export function TrendsUpload({ onUploadComplete }: { onUploadComplete: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/trends/upload", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        setTimeout(onUploadComplete, 500);
      }
    } catch {
      setResult({ success: false, inserted: 0, matched: [], unmatched: [], dateRange: "", error: "Upload failed" });
    }
    setUploading(false);
  }, [onUploadComplete]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) handleUpload(file);
  }, [handleUpload]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload Google Trends CSV
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
          {uploading ? (
            <p className="text-sm text-muted-foreground">Uploading...</p>
          ) : (
            <>
              <p className="text-sm font-medium">Drop CSV here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">
                Export from{" "}
                <a href="https://trends.google.com/trends/explore?geo=PH" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                  Google Trends
                </a>
                {" "}→ Download CSV → Upload here
              </p>
            </>
          )}
        </div>

        {result && (
          <div className={`mt-3 p-3 rounded-md text-xs ${result.success ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700"}`}>
            {result.success ? (
              <>
                <p className="font-medium">✅ {result.inserted} data points imported</p>
                {result.matched.length > 0 && (
                  <p className="mt-1">Matched: {result.matched.join(", ")}</p>
                )}
                {result.unmatched.length > 0 && (
                  <p className="mt-1 text-amber-600">Unmatched keywords: {result.unmatched.join(", ")}</p>
                )}
                <p className="mt-1 text-muted-foreground">{result.dateRange}</p>
              </>
            ) : (
              <p className="font-medium">❌ {result.error}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
