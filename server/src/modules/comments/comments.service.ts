import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { WebsocketGateway } from "../websocket/websocket.gateway";

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private ws: WebsocketGateway,
  ) {}

  async create(data: { content: string; cardId: string; authorId: string }) {
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
      throw new NotFoundException("Card not found");
    }

    // Check if user has access to the board
    const hasAccess =
      card.list.board.ownerId === data.authorId ||
      card.list.board.members.some((m) => m.userId === data.authorId);

    if (!hasAccess && !card.list.board.isPrivate) {
      throw new ForbiddenException("No access to this board");
    }

    const comment = await this.prisma.comment.create({
      data: {
        content: data.content,
        cardId: data.cardId,
        authorId: data.authorId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    // Create activity log
    const activity = await this.prisma.activity.create({
      data: {
        type: "COMMENT_ADDED",
        userId: data.authorId,
        cardId: data.cardId,
        boardId: card.list.board.id,
        data: {
          commentId: comment.id,
          cardTitle: card.title,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    // Emit realtime create event
    this.ws.notifyCommentCreated(card.list.board.id, {
      cardId: data.cardId,
      comment,
    });
    this.ws.notifyActivityCreated(card.list.board.id, activity);

    return comment;
  }

  async findByCard(cardId: string) {
    return this.prisma.comment.findMany({
      where: { cardId },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async update(id: string, data: { content: string }, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
    });

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException("You can only edit your own comments");
    }

    const updated = await this.prisma.comment.update({
      where: { id },
      data: { content: data.content },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });
    // Find boardId and emit
    const card = await this.prisma.card.findUnique({
      where: { id: comment.cardId },
      include: { list: { include: { board: true } } },
    });
    if (card) {
      this.ws.notifyCommentUpdated(card.list.board.id, {
        cardId: comment.cardId,
        comment: updated,
      });
    }
    return updated;
  }

  async remove(id: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
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

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    // Allow deletion if user is comment author or board owner
    const canDelete =
      comment.authorId === userId || comment.card.list.board.ownerId === userId;

    if (!canDelete) {
      throw new ForbiddenException("You cannot delete this comment");
    }

    // Emit before delete (we have boardId and cardId from loaded comment)
    this.ws.notifyCommentDeleted(comment.card.list.board.id, {
      cardId: comment.cardId,
      id,
    });

    return this.prisma.comment.delete({
      where: { id },
    });
  }
}
