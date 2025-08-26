import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FEATURE_FLAG_KEY } from "../decorators/feature-flag.decorator";
import { SystemSettingsService } from "../services/system-settings.service";
import type { SystemSettingsShape } from "../services/system-settings.service";

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly settings: SystemSettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flag = this.reflector.getAllAndOverride<string | undefined>(
      FEATURE_FLAG_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!flag) return true;

    const settings: SystemSettingsShape = await this.settings.getSettings();
    const features = (settings?.features ?? {}) as Record<string, unknown>;
    const enabled = Boolean(features[flag]);

    if (!enabled) {
      throw new ForbiddenException(`Feature disabled: ${flag}`);
    }

    return true;
  }
}
