import type { Platform } from "@/types/fandom";

export type ProviderName = "apify" | "sociavault";

export interface ScrapeParams {
  handle: string;
  keyword?: string;
  limit?: number;
}

export interface ProviderResult {
  success: boolean;
  items: Record<string, unknown>[];
  source: ProviderName;
  error?: string;
  /** Apify dataset ID if applicable */
  datasetId?: string;
}

export interface ScrapeProvider {
  name: ProviderName;
  /** Returns true if this provider supports the given platform */
  supports(platform: Platform): boolean;
  /** Scrape a platform and return normalized raw items */
  scrape(platform: Platform, params: ScrapeParams): Promise<ProviderResult>;
}

export interface PlatformProviderConfig {
  primary: ProviderName;
  secondary: ProviderName;
}
