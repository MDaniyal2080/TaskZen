import { Module } from "@nestjs/common";
import { CardsService } from "./cards.service";
import { CardsController } from "./cards.controller";
import { BoardsModule } from "../boards/boards.module";
import { ListsModule } from "../lists/lists.module";
import { WebsocketModule } from "../websocket/websocket.module";

@Module({
  imports: [BoardsModule, ListsModule, WebsocketModule],
  providers: [CardsService],
  controllers: [CardsController],
  exports: [CardsService],
})
export class CardsModule {}
