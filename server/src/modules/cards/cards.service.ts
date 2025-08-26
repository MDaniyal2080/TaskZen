import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { ListsService } from "../lists/lists.service";
import { CreateCardDto, UpdateCardDto } from "./dto/card.dto";
import { WebsocketGateway } from "../websocket/websocket.gateway";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { BoardMemberRole } from "@prisma/client";
import { SystemSettingsService } from "../../common/services/system-settings.service";

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);
  constructor(
    private prisma: PrismaService,
    private listsService: ListsService,
    private ws: WebsocketGateway,
    private systemSettings: SystemSettingsService,
  ) {}

  async create(
    createCardDto: CreateCardDto,
    userId: string,
    userRole?: string,
  ) {
    // Verify user has access to the list
    const list = await this.listsService.findOne(createCardDto.listId, userId);

    // Restrict viewers
    const member = list.board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException("Viewers cannot create cards");
    }

    // Enforce max cards per board for free plan (value from system settings)
    // Determine board owner's plan and count of non-archived cards on this board
    const board = await this.prisma.board.findUnique({
      where: { id: list.boardId },
      include: {
        owner: {
          select: { isPro: true },
        },
      },
    });
    if (!board) {
      throw new NotFoundException("Board not found");
    }

    const settings = await this.systemSettings.getSettings();
    const MAX_CARDS_PER_BOARD = Number(
      (settings as any)?.general?.maxCardsPerBoard ?? 100,
    );
    if (!board.owner.isPro) {
      const cardCount = await this.prisma.card.count({
        where: {
          isArchived: false,
          list: { boardId: list.boardId },
        },
      });
      if (cardCount >= MAX_CARDS_PER_BOARD) {
        throw new BadRequestException(
          `Free plan is limited to ${MAX_CARDS_PER_BOARD} cards per board. Please upgrade to Pro for unlimited cards.`,
        );
      }
    }

    // Get the highest position for new card
    const lastCard = await this.prisma.card.findFirst({
      where: { listId: createCardDto.listId },
      orderBy: { position: "desc" },
    });

    const position = lastCard ? lastCard.position + 1000 : 1000;

    const created = await this.prisma.card.create({
      data: {
        ...createCardDto,
        position,
      },
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
        attachments: true,
        checklistItems: {
          orderBy: { position: "asc" },
        },
        comments: {
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
        },
      },
    });

    // Emit real-time event
    this.ws.notifyCardCreated(list.boardId, created);
    // Activity: card created
    const activity = await this.prisma.activity.create({
      data: {
        type: "CARD_CREATED",
        userId,
        boardId: list.boardId,
        cardId: created.id,
        data: {
          cardId: created.id,
          listId: created.listId,
          title: created.title,
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
    this.ws.notifyActivityCreated(list.boardId, activity);
    return created;
  }

  async findAll(listId: string, userId: string) {
    // Verify user has access to the list
    await this.listsService.findOne(listId, userId);

    return this.prisma.card.findMany({
      where: {
        listId,
        isArchived: false,
      },
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
        attachments: true,
        checklistItems: {
          orderBy: { position: "asc" },
        },
        comments: {
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
        },
      },
      orderBy: { position: "asc" },
    });
  }

  async findOne(id: string, userId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id },
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
        assignee: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
        attachments: true,
        checklistItems: {
          orderBy: { position: "asc" },
        },
        comments: {
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
        },
      },
    });

    if (!card) {
      throw new NotFoundException("Card not found");
    }

    // Verify user has access to the board
    await this.listsService.findOne(card.listId, userId);

    return card;
  }

  async update(
    id: string,
    updateCardDto: UpdateCardDto,
    userId: string,
    userRole?: string,
  ) {
    const card = await this.findOne(id, userId);

    // Restrict viewers
    const member = card.list.board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException("Viewers cannot update cards");
    }

    // If unarchiving a card on a free plan board, enforce max cards per board
    if (
      Object.prototype.hasOwnProperty.call(updateCardDto, "isArchived") &&
      updateCardDto.isArchived === false &&
      card.isArchived
    ) {
      const settings = await this.systemSettings.getSettings();
      const MAX_CARDS_PER_BOARD = Number(
        (settings as any)?.general?.maxCardsPerBoard ?? 100,
      );

      const board = await this.prisma.board.findUnique({
        where: { id: card.list.boardId },
        include: { owner: { select: { isPro: true } } },
      });
      if (!board) {
        throw new NotFoundException("Board not found");
      }
      if (!board.owner.isPro) {
        const cardCount = await this.prisma.card.count({
          where: {
            isArchived: false,
            list: { boardId: card.list.boardId },
          },
        });
        if (cardCount >= MAX_CARDS_PER_BOARD) {
          throw new BadRequestException(
            `Free plan is limited to ${MAX_CARDS_PER_BOARD} cards per board. Please upgrade to Pro for unlimited cards.`,
          );
        }
      }
    }

    const updated = await this.prisma.card.update({
      where: { id },
      data: updateCardDto,
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
        attachments: true,
        comments: {
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
        },
      },
    });
    // Emit real-time event
    this.ws.notifyCardUpdated(card.list.boardId, updated);
    // Activity: card updated
    const activity = await this.prisma.activity.create({
      data: {
        type: "CARD_UPDATED",
        userId,
        boardId: card.list.boardId,
        cardId: id,
        data: updateCardDto as any,
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
    this.ws.notifyActivityCreated(card.list.boardId, activity);
    return updated;
  }

  async remove(id: string, userId: string, userRole?: string) {
    const card = await this.findOne(id, userId);

    // Restrict viewers
    const member = card.list.board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException("Viewers cannot delete cards");
    }

    // Activity: card deleted (emit/log before deletion)
    const activity = await this.prisma.activity.create({
      data: {
        type: "CARD_DELETED",
        userId,
        boardId: card.list.boardId,
        cardId: id,
        data: { title: card.title },
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
    this.ws.notifyActivityCreated(card.list.boardId, activity);

    const removed = await this.prisma.card.delete({
      where: { id },
    });
    // Emit real-time event
    this.ws.notifyCardDeleted(card.list.boardId, { id });
    return removed;
  }

  async getCalendarCards(
    startDate: Date,
    endDate: Date,
    userId: string,
    boardId?: string,
    options?: {
      priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      assigneeId?: string;
      labelIds?: string[];
      completed?: boolean;
      sortBy?: "dueDate" | "priority" | "createdAt" | "title";
      sortOrder?: "asc" | "desc";
    },
  ) {
    // Build the where clause
    const where: any = {
      dueDate: {
        gte: startDate,
        lte: endDate,
      },
      isArchived: false,
      list: {
        board: {
          OR: [
            { ownerId: userId },
            {
              members: {
                some: {
                  userId,
                },
              },
            },
          ],
        },
      },
    };

    // Add board filter if provided
    if (boardId) {
      where.list.boardId = boardId;
    }

    // Apply optional filters
    if (options?.priority) {
      where.priority = options.priority;
    }

    if (typeof options?.completed === "boolean") {
      where.isCompleted = options.completed;
    }

    if (options?.assigneeId) {
      where.assigneeId = options.assigneeId;
    }

    if (options?.labelIds && options.labelIds.length > 0) {
      where.labels = {
        some: {
          labelId: { in: options.labelIds },
        },
      };
    }

    // Determine sorting
    const sortBy = options?.sortBy || "dueDate";
    const sortOrder = options?.sortOrder || "asc";

    return this.prisma.card.findMany({
      where,
      include: {
        list: {
          include: {
            board: true,
          },
        },
        assignee: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
      orderBy:
        sortBy === "dueDate"
          ? { dueDate: sortOrder }
          : sortBy === "priority"
            ? { priority: sortOrder }
            : sortBy === "createdAt"
              ? { createdAt: sortOrder }
              : { title: sortOrder },
    });
  }

  async moveCard(
    id: string,
    listId: string,
    position: number,
    userId: string,
    userRole?: string,
  ) {
    const card = await this.findOne(id, userId);

    // Verify user has access to the target list
    const targetList = await this.listsService.findOne(listId, userId);

    // Restrict viewers (on both source and target boards)
    const memberSource = card.list.board.members.find(
      (m) => m.userId === userId,
    );
    const memberTarget = targetList.board.members.find(
      (m) => m.userId === userId,
    );
    if (
      (memberSource && memberSource.role === BoardMemberRole.VIEWER) ||
      (memberTarget && memberTarget.role === BoardMemberRole.VIEWER)
    ) {
      throw new ForbiddenException("Viewers cannot move cards");
    }

    // If moving across boards, enforce max cards per board on the target board for free plan
    if (card.list.boardId !== targetList.boardId) {
      const settings = await this.systemSettings.getSettings();
      const MAX_CARDS_PER_BOARD = Number(
        (settings as any)?.general?.maxCardsPerBoard ?? 100,
      );

      const targetBoard = await this.prisma.board.findUnique({
        where: { id: targetList.boardId },
        include: { owner: { select: { isPro: true } } },
      });
      if (!targetBoard) {
        throw new NotFoundException("Board not found");
      }
      if (!targetBoard.owner.isPro) {
        const cardCount = await this.prisma.card.count({
          where: {
            isArchived: false,
            list: { boardId: targetList.boardId },
          },
        });
        if (cardCount >= MAX_CARDS_PER_BOARD) {
          throw new BadRequestException(
            `Free plan is limited to ${MAX_CARDS_PER_BOARD} cards per board. Please upgrade to Pro for unlimited cards.`,
          );
        }
      }
    }

    const moved = await this.prisma.card.update({
      where: { id },
      data: {
        listId,
        position,
      },
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
      },
    });
    // Emit real-time event
    this.ws.notifyCardMoved(targetList.boardId, { id, listId, position });
    // Activity: card moved
    const activity = await this.prisma.activity.create({
      data: {
        type: "CARD_MOVED",
        userId,
        boardId: targetList.boardId,
        cardId: id,
        data: {
          cardId: id,
          fromListId: card.listId,
          toListId: listId,
          fromPosition: card.position,
          toPosition: position,
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
    this.ws.notifyActivityCreated(targetList.boardId, activity);
    return moved;
  }

  async addComment(
    cardId: string,
    content: string,
    userId: string,
    userRole?: string,
  ) {
    // Verify user has access to the card
    const card = await this.findOne(cardId, userId);

    // Restrict viewers
    const member = card.list.board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException("Viewers cannot add comments");
    }

    return this.prisma.comment.create({
      data: {
        content,
        cardId,
        authorId: userId,
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
  }

  async uploadAttachments(
    cardId: string,
    files: Express.Multer.File[],
    userId: string,
    userRole?: string,
  ) {
    // Verify user has access to the card
    const card = await this.findOne(cardId, userId);

    // Restrict viewers
    const member = card.list.board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException("Viewers cannot upload attachments");
    }

    if (!files || files.length === 0) {
      throw new BadRequestException(
        'No files uploaded. Ensure multipart/form-data with field name "files".',
      );
    }

    // Resolve absolute upload directory
    const baseUpload = process.env.UPLOAD_PATH || "uploads";
    const uploadDir = path.isAbsolute(baseUpload)
      ? baseUpload
      : path.join(process.cwd(), baseUpload);
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
    } catch (e: any) {
      this.logger.error(
        `Failed to prepare upload directory '${uploadDir}': ${e?.message}`,
        e?.stack,
      );
      throw new InternalServerErrorException(
        "Failed to prepare upload directory",
      );
    }

    // Track created records for cleanup on failure
    const createdRecords: { id: string; filename: string }[] = [];
    try {
      const attachments = [] as any[];
      for (const file of files) {
        // Sanitize filename: use UUID + original extension only
        const ext = (path.extname(file?.originalname || "") || "").slice(0, 10);
        const filename = `${uuidv4()}${ext}`;
        const filepath = path.join(uploadDir, filename);

        // Normalize buffer (Buffer | Uint8Array | { type: 'Buffer', data: number[] })
        let data: Buffer;
        try {
          const raw = (file as any).buffer;
          if (Buffer.isBuffer(raw)) {
            data = raw as Buffer;
          } else if (raw instanceof Uint8Array) {
            data = Buffer.from(raw);
          } else if (Array.isArray(raw?.data)) {
            data = Buffer.from(raw.data);
          } else {
            throw new Error("Unsupported buffer format");
          }
        } catch (e: any) {
          this.logger.error(
            `Buffer normalization failed for '${file?.originalname}': ${e?.message}`,
          );
          throw new BadRequestException(
            "Invalid file payload; could not read file buffer.",
          );
        }

        // Save file to disk
        try {
          fs.writeFileSync(filepath, data);
        } catch (e: any) {
          this.logger.error(
            `Failed to write file '${filepath}': ${e?.message}`,
            e?.stack,
          );
          throw new InternalServerErrorException(
            `Failed to save file ${file?.originalname || ""}`,
          );
        }

        // Create attachment record
        const attachment = await this.prisma.attachment.create({
          data: {
            filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: typeof file.size === "number" ? file.size : data.length,
            url: `/uploads/${filename}`,
            cardId,
          },
        });

        createdRecords.push({ id: attachment.id, filename });
        attachments.push(attachment);
      }

      // Emit real-time event with full attachments list
      const allAttachments = await this.prisma.attachment.findMany({
        where: { cardId },
      });
      this.ws.notifyCardUpdated(card.list.boardId, {
        id: cardId,
        attachments: allAttachments,
      });
      return attachments;
    } catch (err) {
      // Cleanup best-effort: remove files and DB records created before failure
      for (const rec of createdRecords) {
        try {
          const fp = path.join(uploadDir, rec.filename);
          if (fs.existsSync(fp)) {
            fs.unlinkSync(fp);
          }
        } catch {}
        try {
          await this.prisma.attachment.delete({ where: { id: rec.id } });
        } catch {}
      }
      throw err;
    }
  }

  async deleteAttachment(
    attachmentId: string,
    userId: string,
    userRole?: string,
  ) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        card: {
          include: {
            list: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException("Attachment not found");
    }

    // Verify user has access to the card and restrict viewers
    const cardFull = await this.findOne(attachment.cardId, userId);
    const member = cardFull.list.board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException("Viewers cannot delete attachments");
    }

    // Delete file from disk
    const baseUpload = process.env.UPLOAD_PATH || "uploads";
    const uploadDir = path.isAbsolute(baseUpload)
      ? baseUpload
      : path.join(process.cwd(), baseUpload);
    const filepath = path.join(uploadDir, attachment.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    // Delete attachment record
    const deleted = await this.prisma.attachment.delete({
      where: { id: attachmentId },
    });

    // Emit real-time event with full attachments list after deletion
    const remaining = await this.prisma.attachment.findMany({
      where: { cardId: attachment.cardId },
    });
    this.ws.notifyCardUpdated(attachment.card.list.boardId, {
      id: attachment.cardId,
      attachments: remaining,
    });

    return deleted;
  }

  async addLabel(
    cardId: string,
    labelId: string,
    userId: string,
    userRole?: string,
  ) {
    // Verify user has access to the card
    const card = await this.findOne(cardId, userId);

    // Restrict viewers
    const member = card.list.board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException("Viewers cannot modify labels");
    }

    // Check if label exists and belongs to the same board
    const label = await this.prisma.label.findFirst({
      where: {
        id: labelId,
        boardId: card.list.boardId,
      },
    });

    if (!label) {
      throw new NotFoundException("Label not found or not accessible");
    }

    // Check if label is already added to card
    const existing = await this.prisma.cardLabel.findUnique({
      where: {
        cardId_labelId: {
          cardId,
          labelId,
        },
      },
    });

    if (existing) {
      return existing;
    }

    const cardLabel = await this.prisma.cardLabel.create({
      data: {
        cardId,
        labelId,
      },
      include: {
        label: true,
      },
    });

    // Emit real-time event
    this.ws.notifyCardUpdated(card.list.boardId, { id: cardId });

    return cardLabel;
  }

  async removeLabel(
    cardId: string,
    labelId: string,
    userId: string,
    userRole?: string,
  ) {
    // Verify user has access to the card
    const card = await this.findOne(cardId, userId);

    // Restrict viewers
    const member = card.list.board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException("Viewers cannot modify labels");
    }

    const deleted = await this.prisma.cardLabel.delete({
      where: {
        cardId_labelId: {
          cardId,
          labelId,
        },
      },
    });

    // Emit real-time event
    this.ws.notifyCardUpdated(card.list.boardId, { id: cardId });

    return deleted;
  }

  async listChecklistItems(cardId: string, userId: string) {
    // Verify access
    await this.findOne(cardId, userId);
    return this.prisma.checklistItem.findMany({
      where: { cardId },
      orderBy: { position: "asc" },
    });
  }

  async addChecklistItem(
    cardId: string,
    text: string,
    userId: string,
    userRole?: string,
  ) {
    const card = await this.findOne(cardId, userId);

    // Restrict viewers
    const member = card.list.board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException("Viewers cannot modify checklist");
    }

    const last = await this.prisma.checklistItem.findFirst({
      where: { cardId },
      orderBy: { position: "desc" },
    });
    const position = last ? last.position + 1000 : 1000;

    const item = await this.prisma.checklistItem.create({
      data: { cardId, text, position },
    });

    const items = await this.prisma.checklistItem.findMany({
      where: { cardId },
      orderBy: { position: "asc" },
    });
    this.ws.notifyCardUpdated(card.list.boardId, {
      id: cardId,
      checklistItems: items,
    });
    return item;
  }

  async updateChecklistItem(
    itemId: string,
    data: { text?: string; isCompleted?: boolean },
    userId: string,
    userRole?: string,
  ) {
    const item = await this.prisma.checklistItem.findUnique({
      where: { id: itemId },
      include: {
        card: { include: { list: true } },
      },
    });
    if (!item) throw new NotFoundException("Checklist item not found");

    const cardInfo = await this.findOne(item.cardId, userId);
    const member = cardInfo.list.board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException("Viewers cannot modify checklist");
    }

    const updated = await this.prisma.checklistItem.update({
      where: { id: itemId },
      data,
    });

    const items = await this.prisma.checklistItem.findMany({
      where: { cardId: item.cardId },
      orderBy: { position: "asc" },
    });
    this.ws.notifyCardUpdated(item.card.list.boardId, {
      id: item.cardId,
      checklistItems: items,
    });
    return updated;
  }

  async deleteChecklistItem(itemId: string, userId: string, userRole?: string) {
    const item = await this.prisma.checklistItem.findUnique({
      where: { id: itemId },
      include: { card: { include: { list: true } } },
    });
    if (!item) throw new NotFoundException("Checklist item not found");

    const cardInfo = await this.findOne(item.cardId, userId);
    const member = cardInfo.list.board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException("Viewers cannot modify checklist");
    }

    const deleted = await this.prisma.checklistItem.delete({
      where: { id: itemId },
    });

    const items = await this.prisma.checklistItem.findMany({
      where: { cardId: item.cardId },
      orderBy: { position: "asc" },
    });
    this.ws.notifyCardUpdated(item.card.list.boardId, {
      id: item.cardId,
      checklistItems: items,
    });
    return deleted;
  }
}
