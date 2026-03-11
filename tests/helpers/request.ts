import { NextRequest } from "next/server";

type CreateApiRequestOptions = {
  method?: string;
  body?: unknown;
  rawBody?: string;
  headers?: HeadersInit;
};

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createApiRequest(
  path: string,
  options: CreateApiRequestOptions = {}
) {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);

  if (!headers.has("Origin")) {
    headers.set("Origin", "http://localhost:3000");
  }

  if (UNSAFE_METHODS.has(method) && !headers.has("Sec-Fetch-Site")) {
    headers.set("Sec-Fetch-Site", "same-origin");
  }

  let payload = options.rawBody;
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(options.body);
  }

  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers,
    body: payload,
  });
}
