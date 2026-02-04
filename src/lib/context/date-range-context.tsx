"use client";

import { createContext, useContext, useState, useMemo, type ReactNode } from "react";

export type DateRangePreset = "7d" | "30d" | "90d" | "1y" | "all";

interface DateRangeContextValue {
  preset: DateRangePreset;
  setPreset: (p: DateRangePreset) => void;
  from: string | null;
  to: string | null;
}

const DateRangeContext = createContext<DateRangeContextValue>({
  preset: "all",
  setPreset: () => {},
  from: null,
  to: null,
});

function getDateRange(preset: DateRangePreset): { from: string | null; to: string | null } {
  if (preset === "all") return { from: null, to: null };

  const now = new Date();
  const to = now.toISOString().split("T")[0];
  const ms: Record<Exclude<DateRangePreset, "all">, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "1y": 365,
  };

  const from = new Date(now.getTime() - ms[preset] * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  return { from, to };
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [preset, setPreset] = useState<DateRangePreset>("all");

  const { from, to } = useMemo(() => getDateRange(preset), [preset]);

  return (
    <DateRangeContext.Provider value={{ preset, setPreset, from, to }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  return useContext(DateRangeContext);
}
