import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { SystemSettingsService } from "../services/system-settings.service";
import type { MaintenanceSettings } from "../services/system-settings.service";

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private readonly settingsService: SystemSettingsService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const url = req.originalUrl || req.url || "";

    // Always allow these paths
    const allowedPatterns = [
      /^\/api\/v1\/status(\/.*)?$/,
      /^\/api\/v1\/auth\/(login|csrf|refresh|me)$/,
      /^\/api\/v1\/admin(\/.*)?$/, // Admin should be able to toggle settings
      /^\/uploads\/(.*)$/,
      /^\/api\/v1\/health(\/.*)?$/,
      /^\/health(\/.*)?$/,
    ];

    if (allowedPatterns.some((p) => p.test(url))) return next();

    const settings = await this.settingsService.getSettings();
    const maintenance: MaintenanceSettings = {
      enabled: false,
      ...(settings?.maintenance ?? {}),
    };

    if (!maintenance?.enabled) return next();

    // IP-based maintenance bypass has been removed

    // Return 503 Service Unavailable with message for clients
    res.status(503).json({
      statusCode: 503,
      error: "Service Unavailable",
      message: maintenance.message || "The service is under maintenance.",
      maintenance: {
        enabled: true,
        message: maintenance.message || null,
        scheduledAt: maintenance.scheduledAt || null,
        estimatedDuration: maintenance.estimatedDuration || null,
      },
    });
  }
}
