import type { Platform } from "@/types/fandom";
import type { PlatformProviderConfig } from "./types";

/**
 * Per-platform provider priority configuration.
 * 
 * SociaVault is PRIMARY for ALL platforms.
 * Apify serves as fallback only.
 * 
 * Rationale (Feb 2026):
 * - Apify actors returning 0 items since Feb 12 (silent failures)
 * - SociaVault tested and working for all 6 platforms
 * - Reddit: Apify IPs blocked industry-wide, SociaVault only option
 */
export const platformProviderConfig: Record<Platform, PlatformProviderConfig> = {
  reddit: {
    primary: "sociavault",
    secondary: "apify",
  },
  tiktok: {
    primary: "sociavault",
    secondary: "apify",
  },
  instagram: {
    primary: "sociavault",
    secondary: "apify",
  },
  youtube: {
    primary: "sociavault",
    secondary: "apify",
  },
  twitter: {
    primary: "sociavault",
    secondary: "apify",
  },
  facebook: {
    primary: "sociavault",
    secondary: "apify",
  },
};
