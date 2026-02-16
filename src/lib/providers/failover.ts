import type { Platform } from "@/types/fandom";
import type { ScrapeProvider, ScrapeParams, ProviderResult, ProviderName } from "./types";
import { platformProviderConfig } from "./config";
import { apifyProvider } from "./apify.provider";
import { sociavaultProvider } from "./sociavault.provider";

const providers: Record<ProviderName, ScrapeProvider> = {
  apify: apifyProvider,
  sociavault: sociavaultProvider,
};

export interface FailoverResult extends ProviderResult {
  /** Which provider actually succeeded */
  source: ProviderName;
  /** Whether failover was triggered (primary failed, secondary used) */
  failoverTriggered: boolean;
  /** Error from primary provider if failover was triggered */
  primaryError?: string;
}

/**
 * Scrape a platform with automatic failover.
 * 
 * Tries the primary provider first. If it fails (error, timeout, or empty results),
 * silently tries the secondary provider.
 * 
 * Source tagging: every item gets a `_source` field for auditing.
 */
export async function scrapeWithFailover(
  platform: Platform,
  params: ScrapeParams
): Promise<FailoverResult> {
  const config = platformProviderConfig[platform];
  if (!config) {
    return {
      success: false,
      items: [],
      source: "apify",
      failoverTriggered: false,
      error: `No provider config for platform: ${platform}`,
    };
  }

  const primaryProvider = providers[config.primary];
  const secondaryProvider = providers[config.secondary];

  // Try primary provider
  console.log(`[Failover] Trying ${config.primary} for ${platform} (${params.handle})`);
  const primaryResult = await primaryProvider.scrape(platform, params);

  if (primaryResult.success && primaryResult.items.length > 0) {
    // Tag items with source
    tagItems(primaryResult.items, config.primary);
    return {
      ...primaryResult,
      failoverTriggered: false,
    };
  }

  // Primary failed or returned empty — try secondary
  const primaryError = primaryResult.error || "Empty results";
  console.log(
    `[Failover] ${config.primary} failed for ${platform}: ${primaryError}. Trying ${config.secondary}...`
  );

  // Check if secondary supports this platform
  if (!secondaryProvider.supports(platform)) {
    console.log(`[Failover] ${config.secondary} does not support ${platform}, skipping`);
    return {
      ...primaryResult,
      failoverTriggered: true,
      primaryError,
      error: `Primary (${config.primary}): ${primaryError}. Secondary (${config.secondary}): not supported for ${platform}.`,
    };
  }

  const secondaryResult = await secondaryProvider.scrape(platform, params);

  if (secondaryResult.success && secondaryResult.items.length > 0) {
    // Tag items with source
    tagItems(secondaryResult.items, config.secondary);
    console.log(
      `[Failover] ${config.secondary} succeeded for ${platform} with ${secondaryResult.items.length} items`
    );
    return {
      ...secondaryResult,
      failoverTriggered: true,
      primaryError,
    };
  }

  // Both failed
  const secondaryError = secondaryResult.error || "Empty results";
  console.error(
    `[Failover] Both providers failed for ${platform}: ` +
    `primary(${config.primary}): ${primaryError}, secondary(${config.secondary}): ${secondaryError}`
  );

  return {
    success: false,
    items: [],
    source: config.primary,
    failoverTriggered: true,
    primaryError,
    error: `Both providers failed. Primary (${config.primary}): ${primaryError}. Secondary (${config.secondary}): ${secondaryError}.`,
  };
}

/**
 * Tag all items with the source provider for auditing.
 */
function tagItems(items: Record<string, unknown>[], source: ProviderName): void {
  for (const item of items) {
    item._source = source;
  }
}
