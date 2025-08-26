import { Injectable, NestMiddleware, Logger } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

type AuthenticatedRequest = Request & { user?: { id?: string } };

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const { method, originalUrl, ip } = req;
    const userAgent = req.get("user-agent") || "";
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || "anonymous";
    let finished = false;

    // Log request
    this.logger.log(
      `→ ${method} ${originalUrl} - ${ip} - ${userAgent} - User: ${userId}`,
    );

    // Log response
    res.on("finish", () => {
      finished = true;
      const { statusCode } = res;
      const responseTime = Date.now() - startTime;
      const contentLength = res.get("content-length");

      const logLevel =
        statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "log";

      this.logger[logLevel](
        `← ${method} ${originalUrl} - ${statusCode} - ${responseTime}ms - ${contentLength || 0} bytes`,
      );

      // Log slow requests (> 1 second)
      if (responseTime > 1000) {
        this.logger.warn(
          `Slow request detected: ${method} ${originalUrl} took ${responseTime}ms`,
        );
      }
    });

    // Client aborted connection before response finished
    req.on("aborted", () => {
      if (!finished) {
        const responseTime = Date.now() - startTime;
        this.logger.warn(
          `⚠️ Client aborted: ${method} ${originalUrl} after ${responseTime}ms (user: ${userId})`,
        );
      }
    });

    // Connection closed unexpectedly (e.g., ECONNRESET)
    res.on("close", () => {
      if (!finished) {
        const responseTime = Date.now() - startTime;
        this.logger.error(
          `✖ Connection closed before finish: ${method} ${originalUrl} after ${responseTime}ms (user: ${userId})`,
        );
      }
    });

    // Response stream error
    res.on("error", (err: unknown) => {
      const responseTime = Date.now() - startTime;
      if (err instanceof Error) {
        this.logger.error(
          `✖ Response error on ${method} ${originalUrl} after ${responseTime}ms: ${err.message}`,
          err.stack,
        );
      } else {
        this.logger.error(
          `✖ Response error on ${method} ${originalUrl} after ${responseTime}ms: ${String(err)}`,
        );
      }
    });

    next();
  }
}
