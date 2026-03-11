import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { addSecurityHeaders, validateCsrfProtection } from "@/lib/security";

export function secureJson(body: unknown, init?: number | ResponseInit): NextResponse {
  const responseInit =
    typeof init === "number" ? { status: init } : init;
  return addSecurityHeaders(NextResponse.json(body, responseInit));
}

export function secureError(
  message: string,
  status: number,
  details?: unknown
): NextResponse {
  return secureJson(details ? { error: message, details } : { error: message }, status);
}

export function validateApiAccess(request: NextRequest): NextResponse | null {
  const securityError = validateCsrfProtection(request);
  if (!securityError) {
    return null;
  }

  return addSecurityHeaders(securityError);
}

type ParsedBodyResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

function getValidationMessage(result: { error?: { issues?: Array<{ message?: string }> } }) {
  return result.error?.issues?.[0]?.message || "Invalid request body";
}

export async function readJsonBody<T>(
  request: NextRequest,
  schema: ZodType<T>
): Promise<ParsedBodyResult<T>> {
  const rawText = await request.text();
  if (!rawText.trim()) {
    return {
      success: false,
      response: secureError("Request body is required", 400),
    };
  }

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(rawText);
  } catch {
    return {
      success: false,
      response: secureError("Request body must be valid JSON", 400),
    };
  }

  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      success: false,
      response: secureError(
        getValidationMessage(parsed),
        400,
        parsed.error.flatten()
      ),
    };
  }

  return { success: true, data: parsed.data };
}

export async function readOptionalJsonBody<T>(
  request: NextRequest,
  schema: ZodType<T>
): Promise<ParsedBodyResult<T | undefined>> {
  const rawText = await request.text();
  if (!rawText.trim()) {
    return { success: true, data: undefined };
  }

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(rawText);
  } catch {
    return {
      success: false,
      response: secureError("Request body must be valid JSON", 400),
    };
  }

  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      success: false,
      response: secureError(
        getValidationMessage(parsed),
        400,
        parsed.error.flatten()
      ),
    };
  }

  return { success: true, data: parsed.data };
}
