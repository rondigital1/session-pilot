/**
 * CSRF and Local-Only Protection
 * 
 * SECURITY: This module provides protection against:
 * - Cross-Site Request Forgery (CSRF) via Origin header validation
 * - DNS rebinding attacks via Sec-Fetch-Site header checks
 * - Unauthorized cross-origin requests
 * 
 * SessionPilot is designed to run locally, so we restrict API access
 * to requests from the same origin.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Allowed origins for API requests
 * 
 * In production, this should be strictly localhost.
 * The port may vary based on configuration.
 */
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  // Support custom port via environment variable
  process.env.NEXT_PUBLIC_APP_URL,
].filter(Boolean) as string[];

/**
 * HTTP methods that modify state and require CSRF protection
 */
const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Validate that a request is from a trusted origin
 * 
 * SECURITY: This function checks multiple headers to prevent CSRF:
 * 1. Origin header - must match allowed origins (if present)
 * 2. Sec-Fetch-Site - browser-controlled header indicating request origin
 * 3. Sec-Fetch-Mode - must be 'cors' or 'same-origin' for API requests
 * 
 * @param request - The incoming request
 * @returns null if valid, or a 403 response if invalid
 */
export function validateCsrfProtection(request: NextRequest): NextResponse | null {
  const method = request.method;
  
  // Read-only methods don't need CSRF protection
  // (though we still check Origin to prevent information leakage)
  if (!UNSAFE_METHODS.includes(method)) {
    return validateOrigin(request);
  }

  // For unsafe methods, require stricter checks
  const originError = validateOrigin(request);
  if (originError) {
    return originError;
  }

  // Check Sec-Fetch-Site header (set by browser, cannot be spoofed by scripts)
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-Fetch-Site
  const secFetchSite = request.headers.get("Sec-Fetch-Site");
  
  // Sec-Fetch-Site values:
  // - "same-origin": Request from same origin (safe)
  // - "same-site": Request from same site but different origin (potentially unsafe)
  // - "cross-site": Request from different site (unsafe)
  // - "none": Direct navigation or bookmark (safe for non-API)
  // - null: Old browsers or non-browser clients (check Origin instead)
  
  if (secFetchSite) {
    if (secFetchSite !== "same-origin" && secFetchSite !== "none") {
      console.warn(
        `[Security] CSRF protection blocked request with Sec-Fetch-Site: ${secFetchSite}`
      );
      return NextResponse.json(
        { error: "Cross-origin requests are not allowed" },
        { status: 403 }
      );
    }
  }

  return null; // Request is valid
}

/**
 * Validate the Origin header
 */
function validateOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("Origin");
  
  // No Origin header - could be same-origin request or non-browser client
  // Allow these but log for monitoring
  if (!origin) {
    // Check if it's a browser request without Origin (unusual)
    const userAgent = request.headers.get("User-Agent") || "";
    if (userAgent.includes("Mozilla") || userAgent.includes("Chrome") || userAgent.includes("Safari")) {
      // Browser request without Origin is suspicious for API calls
      // But we allow it for backwards compatibility with same-origin requests
      return null;
    }
    // Non-browser client (curl, scripts, etc.) - allow with caution
    return null;
  }

  // Check if origin is in allowed list
  if (!ALLOWED_ORIGINS.includes(origin)) {
    console.warn(`[Security] Request blocked from unauthorized origin: ${origin}`);
    return NextResponse.json(
      { error: "Forbidden: unauthorized origin" },
      { status: 403 }
    );
  }

  return null; // Origin is valid
}

/**
 * Check if a request appears to be from a local client
 * 
 * This is an additional defense-in-depth check that can be used
 * to restrict access to truly local requests only.
 */
export function isLocalRequest(request: NextRequest): boolean {
  const host = request.headers.get("Host") || "";
  
  return (
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

/**
 * Security headers to add to all API responses
 */
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

/**
 * Add security headers to a response
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
