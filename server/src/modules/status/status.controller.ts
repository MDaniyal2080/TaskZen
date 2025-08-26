import { Controller, Get } from "@nestjs/common";
import { SystemSettingsService } from "../../common/services/system-settings.service";

@Controller("status")
export class StatusController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Get()
  async getStatus() {
    const s = await this.settings.getSettings();
    const maintenance: any = s?.maintenance || {};
    const features: any = s?.features || {};

    return {
      ok: true,
      serverTime: new Date().toISOString(),
      maintenance: {
        enabled: Boolean(maintenance.enabled),
        message: maintenance.message || null,
        scheduledAt: maintenance.scheduledAt || null,
        estimatedDuration: maintenance.estimatedDuration || null,
      },
      features: {
        enableRegistration: Boolean(features.enableRegistration ?? true),
        enableGoogleAuth: Boolean(features.enableGoogleAuth ?? false),
        enableEmailNotifications: Boolean(
          features.enableEmailNotifications ?? true,
        ),
        enableRealTimeUpdates: Boolean(features.enableRealTimeUpdates ?? true),
        enableFileUploads: Boolean(features.enableFileUploads ?? true),
        enableComments: Boolean(features.enableComments ?? true),
        enablePublicBoards: Boolean(features.enablePublicBoards ?? false),
        enableAnalytics: Boolean(features.enableAnalytics ?? true),
      },
    };
  }
}
