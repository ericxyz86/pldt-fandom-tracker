import { runActor, getDatasetItems } from "@/lib/apify/client";
import { actorConfigs } from "@/lib/apify/actors";
import type { Platform, VerifiedFollower } from "@/types/fandom";

// Platforms that support follower verification via Apify
const VERIFIABLE_PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube"];

// Timeout for verification calls (30 seconds)
const VERIFICATION_TIMEOUT_MS = 30000;

// Delay between batches to avoid rate limits
const BATCH_DELAY_MS = 3000;

export interface EstimatedFollower {
  platform: string;
  handle: string;
  followers: number;
}

/**
 * Check if a platform supports follower verification via Apify
 */
export function canVerifyPlatform(platform: string): boolean {
  return VERIFIABLE_PLATFORMS.includes(platform as Platform);
}

/**
 * Extract follower count from raw Apify data for a specific platform
 */
function extractFollowerCount(
  platform: Platform,
  rawData: Record<string, unknown>[]
): number | null {
  if (!rawData || rawData.length === 0) return null;

  const firstItem = rawData[0];

  switch (platform) {
    case "instagram":
      return (
        (firstItem.ownerFollowerCount as number) ||
        (firstItem.ownerFollowersCount as number) ||
        null
      );

    case "tiktok": {
      const authorMeta = firstItem.authorMeta as
        | Record<string, unknown>
        | undefined;
      return (
        (authorMeta?.fans as number) ||
        (authorMeta?.followers as number) ||
        null
      );
    }

    case "youtube":
      return (firstItem.channelSubscribers as number) || null;

    default:
      return null;
  }
}

/**
 * Verify follower count for a single platform/handle
 */
export async function verifyFollowerCount(
  platform: Platform,
  handle: string
): Promise<VerifiedFollower> {
  const result: VerifiedFollower = {
    platform,
    handle,
    followers: 0,
    verified: false,
  };

  if (!canVerifyPlatform(platform)) {
    result.error = "Platform does not support verification";
    return result;
  }

  const actorConfig = actorConfigs[platform];
  if (!actorConfig) {
    result.error = `No actor configured for ${platform}`;
    return result;
  }

  try {
    // Build input with limit=1 for minimal data fetch
    const input = actorConfig.buildInput({
      handle: handle.replace("@", ""),
      limit: 1,
    });

    // Run actor with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Verification timeout")),
        VERIFICATION_TIMEOUT_MS
      );
    });

    const datasetId = await Promise.race([
      runActor(actorConfig.actorId, input),
      timeoutPromise,
    ]);

    const rawData = await getDatasetItems(datasetId);
    const followers = extractFollowerCount(platform, rawData);

    if (followers !== null && followers > 0) {
      result.followers = followers;
      result.verified = true;
      result.verifiedAt = new Date().toISOString();
    } else {
      result.error = "Could not extract follower count from response";
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Verification failed";
    console.error(`[Verify] Failed for ${platform}/@${handle}:`, result.error);
  }

  return result;
}

/**
 * Verify follower counts for all platforms of a single fandom
 * Runs verifiable platforms in parallel
 */
export async function verifyFandomFollowers(
  estimatedFollowers: EstimatedFollower[]
): Promise<VerifiedFollower[]> {
  const results: VerifiedFollower[] = [];

  // Separate verifiable and non-verifiable platforms
  const verifiable = estimatedFollowers.filter((ef) =>
    canVerifyPlatform(ef.platform)
  );
  const nonVerifiable = estimatedFollowers.filter(
    (ef) => !canVerifyPlatform(ef.platform)
  );

  // Add non-verifiable platforms as unverified results (keep LLM estimate)
  for (const ef of nonVerifiable) {
    results.push({
      platform: ef.platform,
      handle: ef.handle,
      followers: ef.followers,
      verified: false,
      error: "Platform does not support verification",
    });
  }

  // Run verifiable platforms in parallel
  if (verifiable.length > 0) {
    const verificationPromises = verifiable.map((ef) =>
      verifyFollowerCount(ef.platform as Platform, ef.handle).then((result) => {
        // If verification failed, fall back to estimated count
        if (!result.verified) {
          result.followers = ef.followers;
        }
        return result;
      })
    );

    const verificationResults = await Promise.allSettled(verificationPromises);

    for (let i = 0; i < verificationResults.length; i++) {
      const settled = verificationResults[i];
      if (settled.status === "fulfilled") {
        results.push(settled.value);
      } else {
        // Promise rejected - use estimated value
        results.push({
          platform: verifiable[i].platform,
          handle: verifiable[i].handle,
          followers: verifiable[i].followers,
          verified: false,
          error: settled.reason?.message || "Verification failed",
        });
      }
    }
  }

  return results;
}

/**
 * Batch verify followers for multiple fandoms
 * Processes fandoms in batches with delays to avoid rate limits
 */
export async function batchVerifyFandoms(
  fandomFollowers: Map<string, EstimatedFollower[]>,
  batchSize: number = 5
): Promise<Map<string, VerifiedFollower[]>> {
  const results = new Map<string, VerifiedFollower[]>();
  const fandomIds = Array.from(fandomFollowers.keys());

  for (let i = 0; i < fandomIds.length; i += batchSize) {
    const batch = fandomIds.slice(i, i + batchSize);

    // Process batch in parallel
    const batchPromises = batch.map(async (fandomId) => {
      const estimated = fandomFollowers.get(fandomId) || [];
      const verified = await verifyFandomFollowers(estimated);
      return { fandomId, verified };
    });

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.set(result.value.fandomId, result.value.verified);
      }
    }

    // Delay between batches (except for last batch)
    if (i + batchSize < fandomIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

/**
 * Compute verification status from verified followers array
 */
export function computeVerificationStatus(
  verifiedFollowers: VerifiedFollower[]
): "pending" | "partial" | "complete" | "skipped" {
  if (verifiedFollowers.length === 0) return "pending";

  const verifiable = verifiedFollowers.filter((vf) =>
    canVerifyPlatform(vf.platform)
  );
  const verified = verifiable.filter((vf) => vf.verified);

  if (verifiable.length === 0) return "skipped";
  if (verified.length === 0) return "partial";
  if (verified.length === verifiable.length) return "complete";
  return "partial";
}
