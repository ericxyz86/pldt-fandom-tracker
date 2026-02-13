import { NextRequest, NextResponse } from "next/server";

/**
 * Security middleware: protects all mutating API routes.
 * 
 * Mutating requests (POST/PUT/PATCH/DELETE) to /api/* are allowed if ANY of:
 * 1. Valid Bearer token: Authorization: Bearer <API_SECRET>
 * 2. Same-origin request: Origin or Referer matches the app's own domain
 * 
 * This means:
 * - Dashboard UI works seamlessly (same-origin browser requests pass through)
 * - External API calls require a Bearer token
 * - Cron routes are excluded (they use their own CRON_SECRET)
 * - GET/HEAD/OPTIONS are always allowed (read-only)
 * 
 * Set API_SECRET in your environment variables.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // Only protect /api/* routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip cron routes — they have their own CRON_SECRET auth
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // Allow GET/HEAD/OPTIONS through (read-only)
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return NextResponse.next();
  }

  // Check 1: Bearer token auth (for external API calls, scripts, etc.)
  const authHeader = req.headers.get("authorization");
  const apiSecret = process.env.PLDT_API_SECRET || process.env.API_SECRET;

  if (apiSecret && authHeader === `Bearer ${apiSecret}`) {
    return NextResponse.next();
  }

  // Check 2: Same-origin request (browser dashboard usage)
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");

  if (host) {
    const allowedOrigins = [
      `https://${host}`,
      `http://${host}`,
    ];

    if (origin && allowedOrigins.includes(origin)) {
      return NextResponse.next();
    }

    if (referer) {
      const refererOrigin = new URL(referer).origin;
      if (allowedOrigins.includes(refererOrigin)) {
        return NextResponse.next();
      }
    }
  }

  // Neither valid token nor same-origin — reject
  if (!apiSecret) {
    console.error("[middleware] PLDT_API_SECRET is not set — blocking external mutating API request");
  }

  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401 }
  );
}

export const config = {
  matcher: "/api/:path*",
};
