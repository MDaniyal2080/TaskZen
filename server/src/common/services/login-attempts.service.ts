import { Injectable, Inject } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";

@Injectable()
export class LoginAttemptsService {
  private readonly prefix = "login_attempts:";

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  private key(email: string) {
    const normalized = (email || "").toLowerCase().trim();
    return `${this.prefix}${normalized}`;
  }

  async getCount(email: string): Promise<number> {
    const cnt = await this.cache.get<number>(this.key(email));
    return Number(cnt || 0);
  }

  async isLocked(email: string, maxAttempts: number): Promise<boolean> {
    const cnt = await this.getCount(email);
    return cnt >= Math.max(1, Number(maxAttempts || 5));
  }

  async increment(email: string, ttlSec: number): Promise<number> {
    const k = this.key(email);
    const current = (await this.cache.get<number>(k)) || 0;
    const next = current + 1;
    // cache-manager here expects ttl as number (seconds)
    await this.cache.set(
      k,
      next,
      Math.max(1, Math.floor(Number(ttlSec || 900))),
    );
    return next;
  }

  async reset(email: string): Promise<void> {
    await this.cache.del(this.key(email));
  }
}
