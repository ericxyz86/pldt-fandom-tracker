"use client";

import { useMemo, useState } from "react";
import { FandomCard } from "@/components/dashboard/fandom-card";
import { getMockFandoms } from "@/lib/data/mock";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function FandomsPage() {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const allFandoms = useMemo(() => getMockFandoms(), []);

  const filtered = useMemo(() => {
    let result = allFandoms;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.fandomGroup?.toLowerCase().includes(q)
      );
    }
    if (tierFilter !== "all") {
      result = result.filter((f) => f.tier === tierFilter);
    }
    return result;
  }, [allFandoms, search, tierFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Fandoms</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse and search all tracked fandoms
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search fandoms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="emerging">Emerging</SelectItem>
            <SelectItem value="trending">Trending</SelectItem>
            <SelectItem value="existing">Established</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((fandom) => (
          <FandomCard key={fandom.slug} fandom={fandom} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No fandoms match your search criteria.
        </div>
      )}
    </div>
  );
}
