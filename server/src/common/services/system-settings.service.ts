import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import type { SystemSettings as DBSystemSettings } from "@prisma/client";

export interface MaintenanceSettings {
  enabled: boolean;
  message?: string | null;
  scheduledAt?: string | null;
  estimatedDuration?: string | number | null;
}

export interface GeneralSettings {
  siteName: string;
  maxBoardsPerUser: number;
  maxCardsPerBoard: number;
  maxFileSize: number; // MB
}

export interface FeatureFlags {
  enableRegistration?: boolean;
  enableGoogleAuth?: boolean;
  enableEmailNotifications?: boolean;
  enableRealTimeUpdates?: boolean;
  enableFileUploads?: boolean;
  enableComments?: boolean;
  enablePublicBoards?: boolean;
  enableAnalytics?: boolean;
}

export interface SecuritySettings {
  requireEmailVerification?: boolean;
  enableTwoFactor?: boolean;
  sessionTimeout?: number; // minutes
  passwordMinLength?: number;
  maxLoginAttempts?: number;
  loginAttemptWindowSec?: number;
  enableRateLimiting?: boolean;
  rateLimitRequests?: number;
  rateLimitWindow?: number; // seconds
}

export interface EmailTemplates {
  welcome?: boolean;
  passwordReset?: boolean;
  emailVerification?: boolean;
  subscription?: boolean;
}

export interface EmailSettings {
  enabled?: boolean;
  provider?: string;
  fromEmail?: string;
  fromName?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  templates?: EmailTemplates;
}

export interface PaymentSettings {
  enabled?: boolean;
  provider?: string;
  currency?: string;
  monthlyPrice?: number;
  yearlyPrice?: number;
  trialDays?: number;
}

export interface SystemSettingsShape {
  general?: GeneralSettings;
  maintenance?: MaintenanceSettings;
  features?: FeatureFlags;
  security?: SecuritySettings;
  email?: EmailSettings;
  payments?: PaymentSettings;
  [key: string]: unknown;
}

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);
  private cache: { settings: SystemSettingsShape | null; fetchedAt: number } = {
    settings: null,
    fetchedAt: 0,
  };
  private readonly TTL_MS = 5000;
  private inFlight: Promise<SystemSettingsShape> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(forceRefresh = false): Promise<SystemSettingsShape> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cache.settings &&
      now - this.cache.fetchedAt < this.TTL_MS
    ) {
      return this.cache.settings;
    }

    if (!forceRefresh && this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = (async (): Promise<SystemSettingsShape> => {
      try {
        const raw = Number(process.env.SETTINGS_FETCH_TIMEOUT_MS || 1000);
        const timeoutMs = Math.min(
          Math.max(Number.isFinite(raw) ? raw : 1000, 1000),
          15000,
        );
        const row: DBSystemSettings | null = await Promise.race([
          this.prisma.systemSettings.findUnique({ where: { id: "default" } }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `SystemSettings fetch timeout after ${timeoutMs}ms`,
                  ),
                ),
              timeoutMs,
            ),
          ),
        ]);

        const defaultGeneral: GeneralSettings = {
          siteName: "TaskZen",
          maxBoardsPerUser: 3,
          maxCardsPerBoard: 100,
          maxFileSize: 5,
        };

        const defaultMaintenance: MaintenanceSettings = {
          enabled: false,
          message: null,
          scheduledAt: null,
          estimatedDuration: null,
        };

        const defaultFeatures: FeatureFlags = {
          enableRegistration: true,
          enableGoogleAuth: false,
          enableEmailNotifications: true,
          enableRealTimeUpdates: true,
          enableFileUploads: true,
          enableComments: true,
          enablePublicBoards: false,
          enableAnalytics: true,
        };

        const defaultSecurity: SecuritySettings = {
          requireEmailVerification: false,
          enableTwoFactor: false,
          sessionTimeout: 10080, // minutes (7 days)
          passwordMinLength: 6,
          maxLoginAttempts: 5,
          loginAttemptWindowSec: 900,
          enableRateLimiting: true,
          rateLimitRequests: 100,
          rateLimitWindow: 60, // seconds
        };

        const defaultEmail: EmailSettings = {
          enabled: false,
          provider: "smtp",
          fromEmail: "noreply@taskzen.app",
          fromName: "TaskZen",
          smtpHost: "smtp.gmail.com",
          smtpPort: 587,
          smtpUser: "",
          smtpPassword: "",
          templates: {
            welcome: true,
            passwordReset: true,
            emailVerification: true,
            subscription: true,
          },
        };

        const defaultPayments: PaymentSettings = {
          enabled: true,
          provider: "stripe",
          currency: "USD",
          monthlyPrice: 9.99,
          yearlyPrice: 99.99,
          trialDays: 14,
        };

        const settings: SystemSettingsShape =
          (row?.data as unknown as SystemSettingsShape) ||
          ({} as SystemSettingsShape);

        const mergedMaintenance: MaintenanceSettings = {
          ...defaultMaintenance,
          ...(settings.maintenance ?? {}),
          enabled: Boolean(
            (settings.maintenance?.enabled ??
              defaultMaintenance.enabled) as boolean,
          ),
        };

        const mergedFeatures: FeatureFlags = {
          ...defaultFeatures,
          ...(settings.features ?? {}),
        };

        const mergedGeneral: GeneralSettings = {
          ...defaultGeneral,
          ...(settings.general ?? {}),
        };

        const mergedSecurity: SecuritySettings = {
          ...defaultSecurity,
          ...(settings.security ?? {}),
        };

        const mergedEmail: EmailSettings = {
          ...defaultEmail,
          ...(settings.email ?? {}),
          templates: {
            ...(defaultEmail.templates || {}),
            ...((settings.email?.templates || {}) as EmailTemplates),
          },
        };

        const mergedPayments: PaymentSettings = {
          ...defaultPayments,
          ...(settings.payments ?? {}),
        };

        const merged: SystemSettingsShape = {
          general: mergedGeneral,
          maintenance: mergedMaintenance,
          features: mergedFeatures,
          security: mergedSecurity,
          email: mergedEmail,
          payments: mergedPayments,
        };
        this.cache = { settings: merged, fetchedAt: Date.now() };
        return merged;
      } catch (err) {
        this.logger.warn(
          `Failed to load system settings, using safe defaults or stale cache. Error: ${err}`,
        );
        // Prefer stale cached settings (even if TTL expired) over hardcoded defaults
        if (this.cache.settings) {
          this.logger.warn(
            `Returning stale system settings from cache due to fetch failure`,
          );
          this.cache = { settings: this.cache.settings, fetchedAt: Date.now() };
          return this.cache.settings;
        }
        const fallback: SystemSettingsShape = {
          general: {
            siteName: "TaskZen",
            maxBoardsPerUser: 3,
            maxCardsPerBoard: 100,
            maxFileSize: 5,
          },
          maintenance: {
            enabled: false,
            message: null,
            scheduledAt: null,
            estimatedDuration: null,
          },
          features: {
            enableRegistration: true,
            enableGoogleAuth: false,
            enableEmailNotifications: true,
            enableRealTimeUpdates: true,
            enableFileUploads: true,
            enableComments: true,
            enablePublicBoards: false,
            enableAnalytics: true,
          },
          security: {
            requireEmailVerification: false,
            enableTwoFactor: false,
            sessionTimeout: 10080,
            passwordMinLength: 6,
            maxLoginAttempts: 5,
            loginAttemptWindowSec: 900,
            enableRateLimiting: true,
            rateLimitRequests: 100,
            rateLimitWindow: 60,
          },
          email: {
            enabled: false,
            provider: "smtp",
            fromEmail: "noreply@taskzen.app",
            fromName: "TaskZen",
            smtpHost: "smtp.gmail.com",
            smtpPort: 587,
            smtpUser: "",
            smtpPassword: "",
            templates: {
              welcome: true,
              passwordReset: true,
              emailVerification: true,
              subscription: true,
            },
          },
          payments: {
            enabled: true,
            provider: "stripe",
            currency: "USD",
            monthlyPrice: 9.99,
            yearlyPrice: 99.99,
            trialDays: 14,
          },
        };
        // Cache fallback to avoid repeated slow attempts for TTL duration
        this.cache = { settings: fallback, fetchedAt: Date.now() };
        return fallback;
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  // Explicit cache controls to ensure immediate propagation after admin updates
  // Use setCache right after DB writes to avoid stale reads when a fetch might time out
  public setCache(settings: SystemSettingsShape) {
    this.cache = { settings, fetchedAt: Date.now() };
    try {
      const enabled = (settings as any)?.maintenance?.enabled;
      this.logger.log(
        `SystemSettings cache set (maintenance.enabled=${String(enabled)})`,
      );
    } catch (_) {
      // no-op
    }
  }

  public invalidateCache() {
    this.cache = { settings: null, fetchedAt: 0 };
    this.inFlight = null;
    this.logger.log("SystemSettings cache invalidated");
  }
}
