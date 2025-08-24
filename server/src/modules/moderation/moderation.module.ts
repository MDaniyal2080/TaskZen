import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [ModerationController],
  providers: [ModerationService, PrismaService],
  exports: [ModerationService],
})
export class ModerationModule {}
