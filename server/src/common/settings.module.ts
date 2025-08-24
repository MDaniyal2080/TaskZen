import { Global, Module } from '@nestjs/common';
import { SystemSettingsService } from './services/system-settings.service';
import { LoginAttemptsService } from './services/login-attempts.service';
import { PasswordResetService } from './services/password-reset.service';
import { PrismaModule } from '../database/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [SystemSettingsService, LoginAttemptsService, PasswordResetService],
  exports: [SystemSettingsService, LoginAttemptsService, PasswordResetService],
})
export class SettingsModule {}
