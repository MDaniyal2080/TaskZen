import { Module } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { AdminController } from "./admin.controller";
import { UsersModule } from "../users/users.module";
import { BoardsModule } from "../boards/boards.module";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AnalyticsService } from "./analytics.service";

@Module({
  imports: [UsersModule, BoardsModule],
  providers: [AdminService, AnalyticsService, RolesGuard],
  controllers: [AdminController],
})
export class AdminModule {}
