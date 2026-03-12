import { NextRequest } from "next/server";
import { discoverRepositories } from "@/server/repos/repoDiscoveryService";
import { secureJson, validateApiAccess } from "@/server/api/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  const repositories = await discoverRepositories();

  return secureJson({
    repositories,
  });
}
