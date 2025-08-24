import { Module } from '@nestjs/common';
import { ListsService } from './lists.service';
import { ListsController } from './lists.controller';
import { BoardsModule } from '../boards/boards.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [BoardsModule, WebsocketModule],
  providers: [ListsService],
  controllers: [ListsController],
  exports: [ListsService],
})
export class ListsModule {}
