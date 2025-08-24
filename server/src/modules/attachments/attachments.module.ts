import { Module } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { PrismaService } from '../../database/prisma.service';
import { S3Service } from '../../common/services/s3.service';

@Module({
  imports: [],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, PrismaService, S3Service],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
