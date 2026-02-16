import type { Platform } from "@/types/fandom";
import type { ScrapeProvider, ScrapeParams, ProviderResult } from "./types";
import { runActor, getDatasetItems } from "@/lib/apify/client";
import { actorConfigs } from "@/lib/apify/actors";

/**
 * Apify provider — wraps existing Apify actor execution.
 * Runs the actor, fetches dataset items, and returns raw items.
 */
export const apifyProvider: ScrapeProvider = {
  name: "apify",

  supports(platform: Platform): boolean {
    const config = actorConfigs[platform];
    return !!config && config.platform === platform;
  },

  async scrape(platform: Platform, params: ScrapeParams): Promise<ProviderResult> {
    const actorConfig = actorConfigs[platform];
    if (!actorConfig) {
      return {
        success: false,
        items: [],
        source: "apify",
        error: `No Apify actor configured for platform: ${platform}`,
      };
    }

    try {
      const input = actorConfig.buildInput({
        handle: params.handle,
        keyword: params.keyword,
        limit: params.limit || 20,
      });

      console.log(`[Apify] Running ${actorConfig.actorId} for ${params.handle} (${platform})`);

      const datasetId = await runActor(actorConfig.actorId, input);
      const items = await getDatasetItems(datasetId);

      console.log(`[Apify] Got ${items.length} items for ${params.handle} (${platform})`);

      return {
        success: true,
        items: items as Record<string, unknown>[],
        source: "apify",
        datasetId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown Apify error";
      console.error(`[Apify] Failed for ${params.handle} (${platform}):`, errorMsg);
      return {
        success: false,
        items: [],
        source: "apify",
        error: errorMsg,
      };
    }
  },
};
