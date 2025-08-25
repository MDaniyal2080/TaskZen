import { Module } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { PrismaService } from '../../database/prisma.service';
import { S3Service } from '../../common/services/s3.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebsocketModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, PrismaService, S3Service],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
