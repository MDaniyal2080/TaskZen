import { Module } from "@nestjs/common";
import { CommentsService } from "./comments.service";
import { CommentsController } from "./comments.controller";
import { PrismaService } from "../../database/prisma.service";
import { WebsocketModule } from "../websocket/websocket.module";

@Module({
  imports: [WebsocketModule],
  controllers: [CommentsController],
  providers: [CommentsService, PrismaService],
  exports: [CommentsService],
})
export class CommentsModule {}
