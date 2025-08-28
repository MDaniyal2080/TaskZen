import { Module } from "@nestjs/common";
import { BoardsService } from "./boards.service";
import { BoardsController } from "./boards.controller";
import { WebsocketModule } from "../websocket/websocket.module";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [WebsocketModule, UsersModule],
  providers: [BoardsService],
  controllers: [BoardsController],
  exports: [BoardsService],
})
export class BoardsModule {}
