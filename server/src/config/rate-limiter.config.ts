import { ThrottlerModuleOptions } from "@nestjs/throttler";

const toInt = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const ENABLE_RATE_LIMITING = process.env.ENABLE_RATE_LIMITING !== "false";
const DEFAULT_TTL = toInt(
  process.env.RATE_LIMIT_TTL || process.env.RATE_LIMIT_TTL_SEC,
  60,
);
const DEFAULT_LIMIT = toInt(process.env.RATE_LIMIT_LIMIT, 100);

export const rateLimiterConfig: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: "default",
      ttl: DEFAULT_TTL, // Time window in seconds
      limit: DEFAULT_LIMIT, // Number of requests per ttl window
    },
  ],
  ignoreUserAgents: [
    // Ignore rate limiting for these user agents (e.g., monitoring services)
    /googlebot/gi,
    /bingbot/gi,
  ],
  skipIf: (context) => {
    // Skip rate limiting for admin users or specific endpoints
    const request = context.switchToHttp().getRequest();
    const url: string = request.url || "";
    const isHealthCheck = url === "/health" || url === "/api/v1/health";
    const isStatus = url === "/status" || url === "/api/v1/status";
    const isAdmin = request.user?.role === "ADMIN";
    const disabled = !ENABLE_RATE_LIMITING;

    return disabled || isHealthCheck || isStatus || isAdmin;
  },
};

// Different rate limits for different endpoints
export const rateLimits = {
  auth: {
    ttl: 900, // 15 minutes
    limit: 5, // 5 attempts per 15 minutes for auth endpoints
  },
  api: {
    ttl: DEFAULT_TTL,
    limit: DEFAULT_LIMIT, // Standard API rate limit
  },
  upload: {
    ttl: 3600, // 1 hour
    limit: 10, // 10 uploads per hour
  },
  search: {
    ttl: toInt(process.env.SEARCH_RATE_LIMIT_TTL, 60),
    limit: toInt(process.env.SEARCH_RATE_LIMIT_LIMIT, 30), // 30 searches per minute
  },
};
