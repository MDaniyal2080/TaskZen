import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Body,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { AttachmentsService } from "./attachments.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { FeatureFlag } from "../../common/decorators/feature-flag.decorator";
import { PrismaService } from "../../database/prisma.service";
import { S3Service } from "../../common/services/s3.service";
import { v4 as uuidv4 } from "uuid";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import type { FileFilterCallback } from "multer";

interface RequestWithUser extends Request {
  user: { id: string };
}

// Centralized allowed MIME types
const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/zip",
];

@Controller("attachments")
@UseGuards(JwtAuthGuard)
@FeatureFlag("enableFileUploads")
export class AttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  // Using module-level ALLOWED_MIMES for validation

  // New: Request a presigned S3 upload URL
  @Throttle({ default: { limit: 10, ttl: 3600 } })
  @Post("card/:cardId/presign")
  async presign(
    @Param("cardId") cardId: string,
    @Body()
    body: { filename: string; contentType: string; size: number } | undefined,
    @Req() req: RequestWithUser,
  ) {
    if (!body) {
      throw new BadRequestException(
        "filename, contentType, and size are required",
      );
    }
    const { filename, contentType, size } = body;
    if (!filename || !contentType || typeof size !== "number") {
      throw new BadRequestException(
        "filename, contentType, and size are required",
      );
    }
    if (!ALLOWED_MIMES.includes(contentType)) {
      throw new BadRequestException("Invalid file type");
    }
    const MAX_BYTES = 10 * 1024 * 1024; // 10MB server-side
    if (size > MAX_BYTES) {
      throw new BadRequestException("File size must be less than 10MB");
    }

    // Verify card access quickly (same logic as service)
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: { list: { include: { board: { include: { members: true } } } } },
    });
    if (!card) throw new BadRequestException("Card not found");
    const hasAccess =
      card.list.board.ownerId === req.user.id ||
      card.list.board.members.some((m) => m.userId === req.user.id) ||
      !card.list.board.isPrivate;
    if (!hasAccess) throw new BadRequestException("No access to this board");

    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${uuidv4()}`;
    const key = `attachments/${cardId}/${unique}${extname(filename)}`;
    const uploadUrl = await this.s3.getPresignedUploadUrl(key, contentType);

    return { uploadUrl, key, bucket: this.s3.getBucket() };
  }

  // New: Complete the upload by storing metadata in DB
  @Throttle({ default: { limit: 10, ttl: 3600 } })
  @Post("card/:cardId/complete")
  async complete(
    @Param("cardId") cardId: string,
    @Body()
    body:
      | { key: string; originalName: string; mimeType: string; size: number }
      | undefined,
    @Req() req: RequestWithUser,
  ) {
    if (!body) {
      throw new BadRequestException(
        "key, originalName, mimeType and size are required",
      );
    }
    const { key, originalName, mimeType, size } = body;
    if (!key || !originalName || !mimeType || typeof size !== "number") {
      throw new BadRequestException(
        "key, originalName, mimeType and size are required",
      );
    }
    if (!ALLOWED_MIMES.includes(mimeType)) {
      throw new BadRequestException("Invalid file type");
    }
    const MAX_BYTES = 10 * 1024 * 1024; // 10MB server-side
    if (size > MAX_BYTES) {
      throw new BadRequestException("File size must be less than 10MB");
    }

    const attachment = await this.attachmentsService.create({
      cardId,
      key,
      originalName,
      mimeType,
      size,
      userId: req.user.id,
    });
    return attachment;
  }

  @Throttle({ default: { limit: 10, ttl: 3600 } })
  @Post("card/:cardId")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: "./uploads",
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        cb: FileFilterCallback,
      ) => {
        // Allow common file types
        const mime = file?.mimetype as string | undefined;
        if (mime && ALLOWED_MIMES.includes(mime)) {
          cb(null, true);
        } else {
          // Indicate rejection without passing an Error instance to satisfy types
          cb(null, false);
        }
      },
    }),
  )
  async upload(
    @Param("cardId") cardId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithUser,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    return this.attachmentsService.create({
      cardId,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      userId: req.user.id,
    });
  }

  @Get("card/:cardId")
  findByCard(@Param("cardId") cardId: string) {
    return this.attachmentsService.findByCard(cardId);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: RequestWithUser) {
    return this.attachmentsService.remove(id, req.user.id);
  }
}
