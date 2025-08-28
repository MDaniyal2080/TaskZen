import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  INestApplication,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Keep Prisma internal warnings/errors visible
      log: ["warn", "error"],
    });

    // Middleware for timing and redaction
    this.$use(async (params, next) => {
      const started = Date.now();
      try {
        const result = await next(params);
        const ms = Date.now() - started;
        const isSlow = ms > 500;
        const model = params.model || "raw";
        const action = params.action;
        let dataPreview: string | undefined = undefined;
        if (params.args?.data && typeof params.args.data === "object") {
          const clone: Record<string, unknown> = {
            ...(params.args.data as Record<string, unknown>),
          };
          if ("password" in clone) clone.password = "***redacted***";
          try {
            dataPreview = JSON.stringify(clone);
          } catch (e) {
            // Fallback when JSON serialization fails
            dataPreview = "[unserializable]";
          }
        }
        const base = `${model}.${action} took ${ms}ms`;
        const extra = dataPreview ? ` data=${dataPreview}` : "";
        const message = `Prisma ${base}${extra}`;
        if (isSlow) this.logger.warn(message);
        else this.logger.log(message);
        return result;
      } catch (err: unknown) {
        const model = params.model || "raw";
        const action = params.action;
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        this.logger.error(
          `Prisma error in ${model}.${action}: ${message}`,
          stack,
        );
        throw err;
      }
    });
  }

  async onModuleInit() {
    const timeoutMs = Number(process.env.DB_CONNECT_TIMEOUT_MS || 8000);
    this.logger.log(
      `Attempting to connect to database (timeout=${timeoutMs}ms)...`,
    );
    try {
      let t: NodeJS.Timeout | undefined;
      await Promise.race([
        this.$connect(),
        new Promise((_, reject) => {
          t = setTimeout(
            () =>
              reject(new Error(`Prisma $connect timeout after ${timeoutMs}ms`)),
            timeoutMs,
          );
          // Do not keep the event loop alive just for this timer
          (t as any).unref?.();
        }),
      ]).finally(() => {
        if (t) {
          clearTimeout(t);
          t = undefined;
        }
      });
      this.logger.log("Database connection established");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to connect to database: ${message}`);
      if (process.env.ALLOW_BOOT_WITHOUT_DB === "true") {
        this.logger.warn(
          "ALLOW_BOOT_WITHOUT_DB=true: continuing without DB connection (degraded mode)",
        );
      } else {
        throw err;
      }
    }
  }

  async enableShutdownHooks(app: INestApplication) {
    let isShuttingDown = false;
    const shutdown = async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      await app.close();
    };
    // Ensure graceful shutdown on common termination signals and beforeExit
    process.on("beforeExit", shutdown);
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    process.on("SIGQUIT", shutdown);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
