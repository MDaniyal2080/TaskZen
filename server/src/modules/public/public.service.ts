import { Injectable } from "@nestjs/common";
import { SystemSettingsService } from "../../common/services/system-settings.service";

@Injectable()
export class PublicService {
  constructor(private readonly systemSettings: SystemSettingsService) {}

  async getPublicSettings() {
    try {
      const settings = await this.systemSettings.getSettings();

      // Return only public-safe settings
      return {
        siteName: settings.general?.siteName ?? "TaskZen",
        features: {
          enableRegistration: settings.features?.enableRegistration ?? true,
          enableGoogleAuth: settings.features?.enableGoogleAuth ?? false,
          enablePublicBoards: settings.features?.enablePublicBoards ?? false,
          enableRealTimeUpdates:
            settings.features?.enableRealTimeUpdates ?? true,
          enableComments: settings.features?.enableComments ?? true,
          enableFileUploads: settings.features?.enableFileUploads ?? true,
          enableAnalytics: settings.features?.enableAnalytics ?? true,
          enableEmailNotifications:
            settings.features?.enableEmailNotifications ?? true,
        },
        maintenance: {
          enabled: settings.maintenance?.enabled ?? false,
          message: settings.maintenance?.message ?? "",
          scheduledAt: settings.maintenance?.scheduledAt ?? null,
          estimatedDuration: settings.maintenance?.estimatedDuration ?? null,
        },
        limits: {
          maxBoardsPerUser: settings.general?.maxBoardsPerUser ?? 3,
        },
        payments: {
          enabled: settings.payments?.enabled ?? true,
          provider: settings.payments?.provider ?? "stripe",
          currency: settings.payments?.currency ?? "USD",
          monthlyPrice: settings.payments?.monthlyPrice ?? 9.99,
          yearlyPrice: settings.payments?.yearlyPrice ?? 99.99,
          trialDays: settings.payments?.trialDays ?? 14,
        },
      };
    } catch (error) {
      // Return defaults if DB is not accessible
      return {
        siteName: "TaskZen",
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
          message: "",
          scheduledAt: null,
          estimatedDuration: null,
        },
        limits: {
          maxBoardsPerUser: 3,
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
    }
  }
}
