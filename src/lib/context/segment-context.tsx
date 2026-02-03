"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { MarketSegment } from "@/types/fandom";

interface SegmentContextValue {
  segment: MarketSegment;
  setSegment: (s: MarketSegment) => void;
}

const SegmentContext = createContext<SegmentContextValue>({
  segment: "all",
  setSegment: () => {},
});

export function SegmentProvider({ children }: { children: ReactNode }) {
  const [segment, setSegment] = useState<MarketSegment>("all");
  return (
    <SegmentContext.Provider value={{ segment, setSegment }}>
      {children}
    </SegmentContext.Provider>
  );
}

export function useSegment() {
  return useContext(SegmentContext);
}
