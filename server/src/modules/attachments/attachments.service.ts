import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { S3Service } from '../../common/services/s3.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService, private readonly s3: S3Service, private readonly ws: WebsocketGateway) {}

  async create(data: {
    cardId: string;
    key?: string; // S3 object key (preferred)
    filename?: string; // legacy/local filename (fallback)
    originalName: string;
    mimeType: string;
    size: number;
    userId: string;
  }) {
    // Verify card exists and user has access
    const card = await this.prisma.card.findUnique({
      where: { id: data.cardId },
      include: {
        list: {
          include: {
            board: {
              include: {
                members: true,
              },
            },
          },
        },
      },
    });

    if (!card) {
      throw new NotFoundException('Card not found');
    }

    // Check if user has access to the board
    const hasAccess = 
      card.list.board.ownerId === data.userId ||
      card.list.board.members.some(m => m.userId === data.userId);

    if (!hasAccess && card.list.board.isPrivate) {
      throw new ForbiddenException('No access to this board');
    }

    const isS3 = Boolean(data.key);

    const attachment = await this.prisma.attachment.create({
      data: {
        filename: data.filename || (data.key ? data.key.split('/').pop() || 'file' : ''),
        originalName: data.originalName,
        mimeType: data.mimeType,
        size: data.size,
        // Store S3 key in url when using S3, else store local path
        url: isS3 ? (data.key as string) : `/uploads/${data.filename}`,
        cardId: data.cardId,
      },
    });

    // Create activity log
    await this.prisma.activity.create({
      data: {
        type: 'CARD_UPDATED',
        userId: data.userId,
        cardId: data.cardId,
        boardId: card.list.board.id,
        data: {
          action: 'attachment_added',
          filename: data.originalName,
          cardTitle: card.title,
        },
      },
    });

    // For S3-backed attachments, return with a temporary download URL for convenience
    let result: any;
    if (isS3) {
      const signedUrl = await this.s3.getPresignedDownloadUrl(attachment.url).catch(() => null);
      result = { ...attachment, url: signedUrl || this.s3.buildPublicUrl(attachment.url) } as any;
    } else {
      result = attachment as any;
    }

    // Emit real-time update with the current full attachments list (presigned URLs for S3)
    const updatedAttachments = await this.findByCard(data.cardId);
    this.ws.notifyCardUpdated(card.list.board.id, { id: data.cardId, attachments: updatedAttachments });

    return result;
  }

  async findByCard(cardId: string) {
    const items = await this.prisma.attachment.findMany({
      where: { cardId },
      orderBy: { createdAt: 'desc' },
    });
    // Augment with presigned download URLs if stored on S3
    const results = await Promise.all(
      items.map(async (a) => {
        if (a.url && !a.url.startsWith('/uploads/')) {
          const url = await this.s3.getPresignedDownloadUrl(a.url).catch(() => this.s3.buildPublicUrl(a.url));
          return { ...a, url } as any;
        }
        return a as any;
      })
    );
    return results;
  }

  async remove(id: string, userId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: {
        card: {
          include: {
            list: {
              include: {
                board: true,
              },
            },
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Check if user has permission to delete
    const canDelete = 
      attachment.card.list.board.ownerId === userId ||
      attachment.card.assigneeId === userId;

    if (!canDelete) {
      const member = await this.prisma.boardMember.findUnique({
        where: {
          userId_boardId: {
            userId,
            boardId: attachment.card.list.board.id,
          },
        },
      });

      if (!member || member.role === 'VIEWER') {
        throw new ForbiddenException('You cannot delete this attachment');
      }
    }

    // Delete object from storage
    if (attachment.url && !attachment.url.startsWith('/uploads/')) {
      // S3-backed
      await this.s3.deleteObject(attachment.url);
    } else {
      // Legacy local file
      await this.deleteFile(attachment.filename);
    }

    // Delete from database
    const deleted = await this.prisma.attachment.delete({
      where: { id },
    });

    // Create activity log
    await this.prisma.activity.create({
      data: {
        type: 'CARD_UPDATED',
        userId,
        cardId: attachment.cardId,
        boardId: attachment.card.list.board.id,
        data: {
          action: 'attachment_removed',
          filename: attachment.originalName,
          cardTitle: attachment.card.title,
        },
      },
    });

    // Emit real-time update with remaining attachments (presigned URLs for S3)
    const remaining = await this.findByCard(attachment.cardId);
    this.ws.notifyCardUpdated(attachment.card.list.board.id, { id: attachment.cardId, attachments: remaining });

    return deleted;
  }

  private async deleteFile(filename: string) {
    try {
      const filePath = join(process.cwd(), 'uploads', filename);
      await unlink(filePath);
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  }
}

