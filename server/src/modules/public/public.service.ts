import { Injectable } from '@nestjs/common';
import { SystemSettingsService } from '../../common/services/system-settings.service';

@Injectable()
export class PublicService {
  constructor(private readonly systemSettings: SystemSettingsService) {}

  async getPublicSettings() {
    try {
      const settings = await this.systemSettings.getSettings();

      // Return only public-safe settings
      return {
        siteName: (settings as any)?.general?.siteName || 'TaskZen',
        features: {
          enableRegistration: (settings as any)?.features?.enableRegistration ?? true,
          enableGoogleAuth: (settings as any)?.features?.enableGoogleAuth ?? false,
          enablePublicBoards: (settings as any)?.features?.enablePublicBoards ?? false,
          enableRealTimeUpdates: (settings as any)?.features?.enableRealTimeUpdates ?? true,
          enableComments: (settings as any)?.features?.enableComments ?? true,
          enableFileUploads: (settings as any)?.features?.enableFileUploads ?? true,
          enableAnalytics: (settings as any)?.features?.enableAnalytics ?? true,
          enableEmailNotifications: (settings as any)?.features?.enableEmailNotifications ?? true,
        },
        maintenance: {
          enabled: (settings as any)?.maintenance?.enabled ?? false,
          message: (settings as any)?.maintenance?.message || '',
          scheduledAt: (settings as any)?.maintenance?.scheduledAt || null,
          estimatedDuration: (settings as any)?.maintenance?.estimatedDuration || null,
        },
        limits: {
          maxBoardsPerUser: Number((settings as any)?.general?.maxBoardsPerUser ?? 3),
        },
        payments: {
          enabled: (settings as any)?.payments?.enabled ?? true,
          provider: (settings as any)?.payments?.provider || 'stripe',
          currency: (settings as any)?.payments?.currency || 'USD',
          monthlyPrice: Number((settings as any)?.payments?.monthlyPrice ?? 9.99),
          yearlyPrice: Number((settings as any)?.payments?.yearlyPrice ?? 99.99),
          trialDays: Number((settings as any)?.payments?.trialDays ?? 14),
        },
      };
    } catch (error) {
      // Return defaults if DB is not accessible
      return {
        siteName: 'TaskZen',
        features: {
          enableRegistration: true,
          enableGoogleAuth: false,
          enablePublicBoards: false,
          enableRealTimeUpdates: true,
          enableComments: true,
          enableFileUploads: true,
          enableAnalytics: true,
          enableEmailNotifications: true,
        },
        maintenance: {
          enabled: false,
          message: '',
          scheduledAt: null,
          estimatedDuration: null,
        },
        limits: {
          maxBoardsPerUser: 3,
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
    }
  }
}

