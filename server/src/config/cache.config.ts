import { CacheModuleOptions } from '@nestjs/cache-manager';

export const cacheConfig: CacheModuleOptions = {
  isGlobal: true,
  ttl: 300, // 5 minutes default TTL
  max: 100, // Maximum number of items in cache
  // Use Redis in production, memory in development
  ...(process.env.REDIS_URL
    ? {
        store: 'redis',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
      }
    : {
        store: 'memory',
      }),
};

// Cache key prefixes for different data types
export const CACHE_KEYS = {
  USER: 'user:',
  BOARD: 'board:',
  BOARDS_LIST: 'boards:list:',
  CARD: 'card:',
  ANALYTICS: 'analytics:',
  SETTINGS: 'settings:',
  SEARCH: 'search:',
} as const;

// Cache TTL values in seconds
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
} as const;
