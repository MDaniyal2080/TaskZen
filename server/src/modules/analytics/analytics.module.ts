import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsEventsService } from "./analytics-events.service";
import { PrismaModule } from "../../database/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsEventsService],
  exports: [AnalyticsEventsService],
})
export class AnalyticsModule {}
