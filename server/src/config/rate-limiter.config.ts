import { ThrottlerModuleOptions } from "@nestjs/throttler";

export const rateLimiterConfig: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: "default",
      ttl: 60, // Time window in seconds
      limit: 100, // Number of requests per ttl window
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

    return isHealthCheck || isStatus || isAdmin;
  },
};

// Different rate limits for different endpoints
export const rateLimits = {
  auth: {
    ttl: 900, // 15 minutes
    limit: 5, // 5 attempts per 15 minutes for auth endpoints
  },
  api: {
    ttl: 60,
    limit: 100, // Standard API rate limit
  },
  upload: {
    ttl: 3600, // 1 hour
    limit: 10, // 10 uploads per hour
  },
  search: {
    ttl: 60,
    limit: 30, // 30 searches per minute
  },
};
