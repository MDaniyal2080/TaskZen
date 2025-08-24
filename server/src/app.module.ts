import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BoardsModule } from './modules/boards/boards.module';
import { ListsModule } from './modules/lists/lists.module';
import { CardsModule } from './modules/cards/cards.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { EmailModule } from './modules/email/email.module';
import { CommentsModule } from './modules/comments/comments.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { LabelsModule } from './modules/labels/labels.module';
import { SearchModule } from './modules/search/search.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { PrismaModule } from './database/prisma.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { rateLimiterConfig } from './config/rate-limiter.config';
import { cacheConfig } from './config/cache.config';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { MaintenanceMiddleware } from './common/middleware/maintenance.middleware';
import { SettingsModule } from './common/settings.module';
import { FeatureFlagGuard } from './common/guards/feature-flag.guard';
import { StatusModule } from './modules/status/status.module';
import { PublicModule } from './modules/public/public.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot(rateLimiterConfig),
    CacheModule.register(cacheConfig),
    SettingsModule,
    PrismaModule,
    StatusModule,
    HealthModule,
    PublicModule,
    AuthModule,
    UsersModule,
    BoardsModule,
    ListsModule,
    CardsModule,
    CommentsModule,
    AttachmentsModule,
    LabelsModule,
    SearchModule,
    ModerationModule,
    AnalyticsModule,
    AdminModule,
    NotificationsModule,
    WebsocketModule,
    EmailModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: FeatureFlagGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware, MaintenanceMiddleware).forRoutes('*');
  }
}
