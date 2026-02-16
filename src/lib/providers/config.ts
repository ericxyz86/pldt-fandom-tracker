import type { Platform } from "@/types/fandom";
import type { PlatformProviderConfig } from "./types";

/**
 * Per-platform provider priority configuration.
 * 
 * - Reddit: SociaVault first (Apify IPs blocked by Reddit)
 * - All others: Apify first (working), SociaVault fallback
 */
export const platformProviderConfig: Record<Platform, PlatformProviderConfig> = {
  reddit: {
    primary: "sociavault",
    secondary: "apify",
  },
  tiktok: {
    primary: "apify",
    secondary: "sociavault",
  },
  instagram: {
    primary: "apify",
    secondary: "sociavault",
  },
  youtube: {
    primary: "apify",
    secondary: "sociavault",
  },
  twitter: {
    primary: "apify",
    secondary: "sociavault",
  },
  facebook: {
    primary: "apify",
    secondary: "sociavault",
  },
};
