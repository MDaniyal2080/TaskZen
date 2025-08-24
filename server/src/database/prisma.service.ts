import { Injectable, OnModuleInit, OnModuleDestroy, INestApplication, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Keep Prisma internal warnings/errors visible
      log: ['warn', 'error'],
    });

    // Middleware for timing and redaction
    this.$use(async (params, next) => {
      const started = Date.now();
      try {
        const result = await next(params);
        const ms = Date.now() - started;
        const isSlow = ms > 500;
        const model = params.model || 'raw';
        const action = params.action;
        let dataPreview: string | undefined = undefined;
        if (params.args?.data && typeof params.args.data === 'object') {
          const clone: Record<string, any> = { ...(params.args.data as any) };
          if ('password' in clone) clone.password = '***redacted***';
          try {
            dataPreview = JSON.stringify(clone);
          } catch {}
        }
        const base = `${model}.${action} took ${ms}ms`;
        const extra = dataPreview ? ` data=${dataPreview}` : '';
        const message = `Prisma ${base}${extra}`;
        if (isSlow) this.logger.warn(message);
        else this.logger.log(message);
        return result;
      } catch (err: any) {
        const model = params.model || 'raw';
        const action = params.action;
        this.logger.error(`Prisma error in ${model}.${action}: ${err?.message || err}`, err?.stack);
        throw err;
      }
    });
  }

  async onModuleInit() {
    const timeoutMs = Number(process.env.DB_CONNECT_TIMEOUT_MS || 8000);
    this.logger.log(`Attempting to connect to database (timeout=${timeoutMs}ms)...`);
    try {
      await Promise.race([
        this.$connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Prisma $connect timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
      this.logger.log('Database connection established');
    } catch (err: any) {
      this.logger.error(`Failed to connect to database: ${err?.message || err}`);
      if (process.env.ALLOW_BOOT_WITHOUT_DB === 'true') {
        this.logger.warn('ALLOW_BOOT_WITHOUT_DB=true: continuing without DB connection (degraded mode)');
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
    process.on('beforeExit', shutdown);
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGQUIT', shutdown);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
