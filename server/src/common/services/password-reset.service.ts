import { Injectable, Inject } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class PasswordResetService {
  private readonly prefix = "pwreset:";

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  private tokenKey(token: string) {
    return `${this.prefix}${(token || "").trim()}`;
  }

  async createToken(email: string, ttlSec: number): Promise<string> {
    const token = uuidv4();
    const key = this.tokenKey(token);
    // Pass TTL as a number (seconds) per current typings
    await this.cache.set(
      key,
      (email || "").toLowerCase().trim(),
      Math.max(60, Math.floor(Number(ttlSec || 900))),
    );
    return token;
  }

  async peekEmail(token: string): Promise<string | null> {
    const email = await this.cache.get<string>(this.tokenKey(token));
    return email || null;
  }

  async consumeToken(token: string): Promise<string | null> {
    const key = this.tokenKey(token);
    const email = await this.cache.get<string>(key);
    if (email) {
      await this.cache.del(key);
      return email;
    }
    return null;
  }
}
