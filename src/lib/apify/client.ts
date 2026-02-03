import { ApifyClient } from "apify-client";

let client: ApifyClient | null = null;

export function getApifyClient(): ApifyClient {
  if (!client) {
    const token = process.env.APIFY_TOKEN;
    if (!token) {
      throw new Error("APIFY_TOKEN environment variable is required");
    }
    client = new ApifyClient({ token });
  }
  return client;
}

export async function runActor(
  actorId: string,
  input: Record<string, unknown>
): Promise<string> {
  const apify = getApifyClient();
  const run = await apify.actor(actorId).call(input);
  return run.defaultDatasetId;
}

export async function getDatasetItems<T = Record<string, unknown>>(
  datasetId: string
): Promise<T[]> {
  const apify = getApifyClient();
  const { items } = await apify.dataset(datasetId).listItems();
  return items as T[];
}
