import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface MaintenanceSettings {
  enabled: boolean;
  message?: string | null;
  scheduledAt?: string | null;
  estimatedDuration?: string | number | null;
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
  maintenance?: MaintenanceSettings;
  features?: FeatureFlags;
  email?: EmailSettings;
  payments?: PaymentSettings;
  [key: string]: any;
}

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);
  private cache: { settings: SystemSettingsShape | null; fetchedAt: number } = {
    settings: null,
    fetchedAt: 0,
  };
  private readonly TTL_MS = 5000;

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(forceRefresh = false): Promise<SystemSettingsShape> {
    const now = Date.now();
    if (!forceRefresh && this.cache.settings && now - this.cache.fetchedAt < this.TTL_MS) {
      return this.cache.settings;
    }

    try {
      const timeoutMs = Number(process.env.SETTINGS_FETCH_TIMEOUT_MS || 1000);
      const row = await Promise.race([
        this.prisma.systemSettings.findUnique({ where: { id: 'default' } }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error(`SystemSettings fetch timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]) as any;
      const settings: SystemSettingsShape = row?.data as any;
      const safeDefaults: SystemSettingsShape = {
        general: {
          siteName: 'TaskZen',
          maxBoardsPerUser: 3,
          maxCardsPerBoard: 100,
          maxFileSize: 5, // MB
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
          sessionTimeout: 10080, // minutes (7 days)
          passwordMinLength: 6,
          maxLoginAttempts: 5,
          loginAttemptWindowSec: 900,
          enableRateLimiting: true,
          rateLimitRequests: 100,
          rateLimitWindow: 60, // seconds
        },
        email: {
          enabled: false,
          provider: 'smtp',
          fromEmail: 'noreply@taskzen.app',
          fromName: 'TaskZen',
          smtpHost: 'smtp.gmail.com',
          smtpPort: 587,
          smtpUser: '',
          smtpPassword: '',
          templates: {
            welcome: true,
            passwordReset: true,
            emailVerification: true,
            subscription: true,
          },
        },
        payments: {
          enabled: true,
          provider: 'stripe',
          currency: 'USD',
          monthlyPrice: 9.99,
          yearlyPrice: 99.99,
          trialDays: 14,
        },
      };

      const mergedMaintenance: MaintenanceSettings = {
        enabled: Boolean((settings as any)?.maintenance?.enabled ?? (safeDefaults.maintenance as MaintenanceSettings).enabled),
        message: ((settings as any)?.maintenance?.message ?? (safeDefaults.maintenance as MaintenanceSettings).message) as any,
        scheduledAt: ((settings as any)?.maintenance?.scheduledAt ?? (safeDefaults.maintenance as MaintenanceSettings).scheduledAt) as any,
        estimatedDuration: ((settings as any)?.maintenance?.estimatedDuration ?? (safeDefaults.maintenance as MaintenanceSettings).estimatedDuration) as any,
      };

      const mergedFeatures: FeatureFlags = {
        ...(safeDefaults.features as FeatureFlags),
        ...((settings as any)?.features || {}),
      };

      const mergedGeneral: any = {
        ...(safeDefaults as any).general,
        ...((settings as any)?.general || {}),
      };

      const mergedSecurity: any = {
        ...(safeDefaults as any).security,
        ...((settings as any)?.security || {}),
      };

      const mergedEmail: EmailSettings = {
        ...(safeDefaults.email as EmailSettings),
        ...(((settings as any)?.email || {}) as EmailSettings),
        templates: {
          ...((safeDefaults.email as EmailSettings).templates || {}),
          ...((((settings as any)?.email || {}) as EmailSettings).templates || {}),
        },
      };

      const mergedPayments: any = {
        ...(safeDefaults as any).payments,
        ...((settings as any)?.payments || {}),
      };

      const merged: SystemSettingsShape = {
        ...safeDefaults,
        ...(settings || {}),
        maintenance: mergedMaintenance,
        features: mergedFeatures,
        general: mergedGeneral,
        security: mergedSecurity,
        email: mergedEmail,
        payments: mergedPayments,
      };

      this.cache = { settings: merged, fetchedAt: now };
      return merged;
    } catch (err) {
      this.logger.warn(`Failed to load system settings, using safe defaults. Error: ${err}`);
      const fallback: SystemSettingsShape = {
        general: {
          siteName: 'TaskZen',
          maxBoardsPerUser: 3,
          maxCardsPerBoard: 100,
          maxFileSize: 5,
        },
        maintenance: { enabled: false, message: null, scheduledAt: null, estimatedDuration: null },
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
          provider: 'smtp',
          fromEmail: 'noreply@taskzen.app',
          fromName: 'TaskZen',
          smtpHost: 'smtp.gmail.com',
          smtpPort: 587,
          smtpUser: '',
          smtpPassword: '',
          templates: {
            welcome: true,
            passwordReset: true,
            emailVerification: true,
            subscription: true,
          },
        },
        payments: {
          enabled: true,
          provider: 'stripe',
          currency: 'USD',
          monthlyPrice: 9.99,
          yearlyPrice: 99.99,
          trialDays: 14,
        },
      };
      // Cache fallback to avoid repeated slow attempts for TTL duration
      this.cache = { settings: fallback, fetchedAt: now };
      return fallback;
    }
  }
}
