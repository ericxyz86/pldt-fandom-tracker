/**
 * Authenticated fetch wrapper for internal API calls.
 * Automatically adds Bearer token to mutating requests (POST/PUT/PATCH/DELETE).
 * GET requests pass through without auth (middleware allows them).
 */

const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET || "";

type FetchOptions = RequestInit & {
  /** Skip auth header (e.g., for GET requests) */
  skipAuth?: boolean;
};

export async function apiFetch(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { skipAuth, ...fetchOptions } = options;
  const method = (fetchOptions.method || "GET").toUpperCase();

  // Add auth header for mutating requests
  if (!skipAuth && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    fetchOptions.headers = {
      ...fetchOptions.headers,
      Authorization: `Bearer ${API_SECRET}`,
    };
  }

  return fetch(url, fetchOptions);
}
