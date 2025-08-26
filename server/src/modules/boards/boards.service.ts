import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { PrismaService } from "../../database/prisma.service";
import { CreateBoardDto } from "./dto/create-board.dto";
import { UpdateBoardDto } from "./dto/update-board.dto";
import { BoardMemberRole, ActivityType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { CACHE_KEYS, CACHE_TTL } from "../../config/cache.config";
import { WebsocketGateway } from "../websocket/websocket.gateway";
import { SystemSettingsService } from "../../common/services/system-settings.service";

interface TemplateCard {
  title: string;
  description?: string | null;
  position: number;
}

interface TemplateList {
  title: string;
  position: number;
  cards?: TemplateCard[];
}

interface TemplateStructure {
  lists?: TemplateList[];
}

type BoardListItem = Prisma.BoardGetPayload<{
  include: {
    owner: {
      select: {
        id: true;
        username: true;
        firstName: true;
        lastName: true;
        avatar: true;
      };
    };
    members: {
      include: {
        user: {
          select: {
            id: true;
            username: true;
            firstName: true;
            lastName: true;
            avatar: true;
          };
        };
      };
    };
    _count: { select: { lists: true } };
  };
}>;

type BoardWithDetails = Prisma.BoardGetPayload<{
  include: {
    owner: {
      select: {
        id: true;
        username: true;
        firstName: true;
        lastName: true;
        avatar: true;
      };
    };
    members: {
      include: {
        user: {
          select: {
            id: true;
            username: true;
            firstName: true;
            lastName: true;
            avatar: true;
          };
        };
      };
    };
    lists: {
      include: {
        cards: {
          include: {
            assignee: {
              select: {
                id: true;
                username: true;
                firstName: true;
                lastName: true;
                avatar: true;
              };
            };
            labels: { include: { label: true } };
            attachments: true;
            comments: {
              include: {
                author: {
                  select: {
                    id: true;
                    username: true;
                    firstName: true;
                    lastName: true;
                    avatar: true;
                  };
                };
              };
            };
          };
        };
      };
    };
    labels: true;
  };
}>;

@Injectable()
export class BoardsService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private ws: WebsocketGateway,
    private systemSettings: SystemSettingsService,
  ) {}

  async create(createBoardDto: CreateBoardDto, userId: string) {
    // Check if user is free and has reached board limit
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isPro: true,
        _count: {
          select: { boards: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Free users can only have a limited number of boards from admin settings
    const settings = await this.systemSettings.getSettings();
    const MAX_FREE_BOARDS = settings.general?.maxBoardsPerUser ?? 3;
    if (!user.isPro && user._count.boards >= MAX_FREE_BOARDS) {
      throw new BadRequestException(
        `Free plan is limited to ${MAX_FREE_BOARDS} boards. Please upgrade to Pro for unlimited boards.`,
      );
    }

    // Handle template creation if templateId is provided
    let template = null;
    if (createBoardDto.templateId) {
      // Check if it's a built-in template first
      const builtInTemplates = [
        {
          id: "kanban-basic",
          structure: {
            lists: [
              { title: "To Do", position: 1, cards: [] },
              { title: "In Progress", position: 2, cards: [] },
              { title: "Done", position: 3, cards: [] },
            ],
          },
        },
        {
          id: "project-management",
          structure: {
            lists: [
              { title: "Backlog", position: 1, cards: [] },
              { title: "Planning", position: 2, cards: [] },
              { title: "In Development", position: 3, cards: [] },
              { title: "Testing", position: 4, cards: [] },
              { title: "Done", position: 5, cards: [] },
            ],
          },
        },
        {
          id: "bug-tracking",
          structure: {
            lists: [
              { title: "Reported", position: 1, cards: [] },
              { title: "Confirmed", position: 2, cards: [] },
              { title: "In Progress", position: 3, cards: [] },
              { title: "Testing", position: 4, cards: [] },
              { title: "Resolved", position: 5, cards: [] },
            ],
          },
        },
      ];

      template = builtInTemplates.find(
        (t) => t.id === createBoardDto.templateId,
      );

      if (!template) {
        // Try to find custom template
        template = await this.prisma.boardTemplate.findUnique({
          where: { id: createBoardDto.templateId },
        });
        if (!template) {
          throw new NotFoundException("Template not found");
        }
      }
    }

    const { templateId: _templateId, ...boardData } = createBoardDto;
    const publicBoardsEnabled = Boolean(settings.features?.enablePublicBoards);
    if (!publicBoardsEnabled && boardData?.isPrivate === false) {
      throw new BadRequestException(
        "Public boards are disabled by the administrator",
      );
    }
    const board = await this.prisma.board.create({
      data: {
        ...boardData,
        ...(publicBoardsEnabled ? {} : { isPrivate: true }),
        ownerId: userId,
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            email: true,
            avatar: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        lists: {
          include: {
            cards: {
              include: {
                assignee: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                  },
                },
                labels: true,
                _count: {
                  select: {
                    comments: true,
                    attachments: true,
                  },
                },
              },
              orderBy: {
                position: "asc",
              },
            },
          },
          orderBy: {
            position: "asc",
          },
        },
        _count: {
          select: {
            members: true,
            lists: true,
          },
        },
      },
    });

    // Add the owner as the first member
    await this.prisma.boardMember.create({
      data: {
        boardId: board.id,
        userId: userId,
        role: BoardMemberRole.OWNER,
      },
    });

    // Create lists and cards from template if provided
    if (template && template.structure) {
      const templateStructure = (template.structure ?? {}) as TemplateStructure;
      // Enforce max cards per board on template seeding for free users
      try {
        const settings = await this.systemSettings.getSettings();
        const MAX_CARDS_PER_BOARD = settings.general?.maxCardsPerBoard ?? 100;
        if (!user.isPro) {
          const totalCardsInTemplate = (templateStructure.lists ?? []).reduce(
            (sum, l) => sum + (l.cards?.length ?? 0),
            0,
          );
          if (totalCardsInTemplate > MAX_CARDS_PER_BOARD) {
            throw new BadRequestException(
              `Free plan is limited to ${MAX_CARDS_PER_BOARD} cards per board. Selected template contains ${totalCardsInTemplate} cards. Please upgrade to Pro or choose a smaller template.`,
            );
          }
        }
      } catch (err) {
        // If settings fail to load, default enforcement still applies via fallback value above
        if (err instanceof BadRequestException) throw err;
      }
      if (templateStructure.lists && Array.isArray(templateStructure.lists)) {
        for (const listData of templateStructure.lists) {
          const createdList = await this.prisma.list.create({
            data: {
              title: listData.title,
              position: listData.position,
              boardId: board.id,
            },
          });

          if (listData.cards && Array.isArray(listData.cards)) {
            for (const cardData of listData.cards) {
              await this.prisma.card.create({
                data: {
                  title: cardData.title,
                  description: cardData.description,
                  position: cardData.position,
                  listId: createdList.id,
                },
              });
            }
          }
        }
      }
    }

    // Activity: board created
    const activity = await this.prisma.activity.create({
      data: {
        type: ActivityType.BOARD_CREATED,
        userId,
        boardId: board.id,
        data: { title: board.title },
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
    this.ws.notifyActivityCreated(board.id, activity);

    return board;
  }

  async findAll(userId: string) {
    // Check cache first
    const cacheKey = `${CACHE_KEYS.BOARDS_LIST}${userId}`;
    const cached = await this.cacheManager.get<BoardListItem[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const boards = await this.prisma.board.findMany({
      where: {
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
        isArchived: false,
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        members: {
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
        },
        _count: {
          select: {
            lists: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Cache the result
    await this.cacheManager.set(cacheKey, boards, CACHE_TTL.MEDIUM);

    return boards;
  }

  async findOne(id: string, userId: string, userRole?: string) {
    // Check cache first
    const cacheKey = `${CACHE_KEYS.BOARD}${id}:${userId}`;
    const cached = await this.cacheManager.get<BoardWithDetails>(cacheKey);
    if (cached) {
      return cached;
    }

    const board = await this.prisma.board.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        members: {
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
        },
        lists: {
          orderBy: { position: "asc" },
          include: {
            cards: {
              orderBy: { position: "asc" },
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
            },
          },
        },
        labels: true,
      },
    });

    if (!board) {
      throw new NotFoundException("Board not found");
    }

    // Check if user has access to the board
    const isAdmin = userRole === "ADMIN";
    const hasAccess =
      isAdmin ||
      board.ownerId === userId ||
      board.members.some((member) => member.userId === userId);

    if (!hasAccess) {
      const settings = await this.systemSettings.getSettings();
      const publicBoardsEnabled = Boolean(
        settings.features?.enablePublicBoards,
      );
      if (board.isPrivate || !publicBoardsEnabled) {
        throw new ForbiddenException("Access denied");
      }
    }

    // Cache the result
    await this.cacheManager.set(cacheKey, board, CACHE_TTL.SHORT);

    return board;
  }

  async update(
    id: string,
    updateBoardDto: UpdateBoardDto,
    userId: string,
    userRole?: string,
  ) {
    const board = await this.findOne(id, userId, userRole);

    // Clear cache on update
    await this.cacheManager.del(`${CACHE_KEYS.BOARD}${id}:${userId}`);
    await this.cacheManager.del(`${CACHE_KEYS.BOARDS_LIST}${userId}`);

    // Check if user has permission to update
    const member = board.members.find((m) => m.userId === userId);
    const canUpdate =
      board.ownerId === userId ||
      (member &&
        (
          [BoardMemberRole.OWNER, BoardMemberRole.ADMIN] as BoardMemberRole[]
        ).includes(member.role));

    if (!canUpdate) {
      throw new ForbiddenException("Insufficient permissions");
    }

    // Enforce public board feature flag on update
    const settings = await this.systemSettings.getSettings();
    const publicBoardsEnabled = Boolean(settings.features?.enablePublicBoards);
    if (!publicBoardsEnabled && updateBoardDto?.isPrivate === false) {
      throw new BadRequestException(
        "Public boards are disabled by the administrator",
      );
    }

    const updated = await this.prisma.board.update({
      where: { id },
      data: updateBoardDto,
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        members: {
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
        },
      },
    });
    // Emit real-time event
    this.ws.notifyBoardUpdate(id, updated);
    // Activity: board updated
    const activity = await this.prisma.activity.create({
      data: {
        type: ActivityType.BOARD_UPDATED,
        userId,
        boardId: id,
        data: updateBoardDto as unknown as Prisma.InputJsonValue,
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
    this.ws.notifyActivityCreated(id, activity);
    return updated;
  }

  async remove(id: string, userId: string, userRole?: string) {
    const board = await this.findOne(id, userId, userRole);

    // Clear cache on delete
    await this.cacheManager.del(`${CACHE_KEYS.BOARD}${id}:${userId}`);
    await this.cacheManager.del(`${CACHE_KEYS.BOARDS_LIST}${userId}`);

    // Only owner can delete the board
    if (board.ownerId !== userId) {
      throw new ForbiddenException("Only the owner can delete the board");
    }

    // Activity: board deleted (emit before deletion)
    const activity = await this.prisma.activity.create({
      data: {
        type: ActivityType.BOARD_DELETED,
        userId,
        boardId: id,
        data: { title: board.title },
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
    this.ws.notifyActivityCreated(id, activity);

    // Emit real-time board deletion event before the board is deleted
    this.ws.notifyBoardDeleted(id, { id });

    return this.prisma.board.delete({
      where: { id },
    });
  }

  async addMember(
    boardId: string,
    userId: string,
    memberUserId: string,
    role: BoardMemberRole = BoardMemberRole.MEMBER,
    userRole?: string,
  ) {
    const board = await this.findOne(boardId, userId, userRole);

    // Check if user has permission to add members
    const member = board.members.find((m) => m.userId === userId);
    const canAddMembers =
      board.ownerId === userId ||
      (member &&
        (
          [BoardMemberRole.OWNER, BoardMemberRole.ADMIN] as BoardMemberRole[]
        ).includes(member.role));

    if (!canAddMembers) {
      throw new ForbiddenException("Insufficient permissions");
    }

    // Check if user is already a member
    const existingMember = await this.prisma.boardMember.findUnique({
      where: {
        userId_boardId: {
          userId: memberUserId,
          boardId,
        },
      },
    });

    if (existingMember) {
      throw new ForbiddenException("User is already a member");
    }

    // Clear cache when members change
    await this.cacheManager.del(`${CACHE_KEYS.BOARD}${boardId}:${userId}`);
    await this.cacheManager.del(`${CACHE_KEYS.BOARDS_LIST}${userId}`);
    await this.cacheManager.del(`${CACHE_KEYS.BOARDS_LIST}${memberUserId}`);

    const created = await this.prisma.boardMember.create({
      data: {
        userId: memberUserId,
        boardId,
        role,
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
    // Emit real-time event (optional for clients that subscribe)
    this.ws.notifyMemberAdded(boardId, created);
    // Activity: member added
    const activity = await this.prisma.activity.create({
      data: {
        type: ActivityType.MEMBER_ADDED,
        userId,
        boardId,
        data: { memberUserId, role },
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
    this.ws.notifyActivityCreated(boardId, activity);
    return created;
  }

  async removeMember(
    boardId: string,
    userId: string,
    memberUserId: string,
    userRole?: string,
  ) {
    const board = await this.findOne(boardId, userId, userRole);

    // Check if user has permission to remove members
    const member = board.members.find((m) => m.userId === userId);
    const canRemoveMembers =
      board.ownerId === userId ||
      (member &&
        (
          [BoardMemberRole.OWNER, BoardMemberRole.ADMIN] as BoardMemberRole[]
        ).includes(member.role));

    if (!canRemoveMembers && userId !== memberUserId) {
      throw new ForbiddenException("Insufficient permissions");
    }

    // Cannot remove the owner
    if (board.ownerId === memberUserId) {
      throw new ForbiddenException("Cannot remove the board owner");
    }

    // Clear cache when members change
    await this.cacheManager.del(`${CACHE_KEYS.BOARD}${boardId}:${userId}`);
    await this.cacheManager.del(`${CACHE_KEYS.BOARDS_LIST}${userId}`);
    await this.cacheManager.del(`${CACHE_KEYS.BOARDS_LIST}${memberUserId}`);

    const removed = await this.prisma.boardMember.delete({
      where: {
        userId_boardId: {
          userId: memberUserId,
          boardId,
        },
      },
    });
    // Emit real-time event (optional)
    this.ws.notifyMemberRemoved(boardId, { userId: memberUserId, boardId });
    // Activity: member removed
    const activity = await this.prisma.activity.create({
      data: {
        type: ActivityType.MEMBER_REMOVED,
        userId,
        boardId,
        data: { memberUserId },
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
    this.ws.notifyActivityCreated(boardId, activity);
    return removed;
  }

  async getActivities(
    boardId: string,
    userId: string,
    options?: { page?: number; pageSize?: number },
  ) {
    // Ensure access
    await this.findOne(boardId, userId);

    const page = Math.max(1, options?.page || 1);
    const pageSize = Math.max(1, Math.min(100, options?.pageSize || 25));
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({
        where: { boardId },
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
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.activity.count({ where: { boardId } }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      hasMore: skip + items.length < total,
    };
  }

  async exportActivitiesCsv(
    boardId: string,
    userId: string,
    filters?: { cardId?: string; userId?: string },
  ): Promise<string> {
    // Ensure access
    await this.findOne(boardId, userId);

    const where: Prisma.ActivityWhereInput = { boardId };
    if (filters?.cardId) where.cardId = filters.cardId;
    if (filters?.userId) where.userId = filters.userId;

    const activities = await this.prisma.activity.findMany({
      where,
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
      orderBy: { createdAt: "desc" },
    });

    // Helpers to build description similar to client-side mapping
    const toDotType = (t: string): string => {
      const map: Record<string, string> = {
        BOARD_CREATED: "board.created",
        BOARD_UPDATED: "board.updated",
        BOARD_DELETED: "board.deleted",
        LIST_CREATED: "board.list_created",
        LIST_UPDATED: "board.list_updated",
        LIST_DELETED: "board.list_deleted",
        CARD_CREATED: "card.created",
        CARD_UPDATED: "card.updated",
        CARD_MOVED: "card.moved",
        CARD_DELETED: "card.deleted",
        MEMBER_ADDED: "member.added",
        MEMBER_REMOVED: "member.removed",
        COMMENT_ADDED: "comment.added",
      };
      if (!t) return "activity";
      return (
        map[t as keyof typeof map] || (t.includes(".") ? t : t.toLowerCase())
      );
    };

    const buildDescription = (
      type: string,
      data: Record<string, unknown>,
    ): string => {
      const t = toDotType(type);
      const title =
        (typeof data.title === "string" ? data.title : "") ||
        (typeof data.name === "string" ? data.name : "");
      if (t === "board.created")
        return `created the board${title ? ` "${title}"` : ""}`;
      if (t === "board.updated") return "updated the board";
      if (t === "board.deleted")
        return `deleted the board${title ? ` "${title}"` : ""}`;
      if (t === "card.created")
        return `created a card${title ? ` "${title}"` : ""}`;
      if (t === "card.updated")
        return `updated a card${title ? ` "${title}"` : ""}`;
      if (t === "card.moved")
        return `moved a card${title ? ` "${title}"` : ""}`;
      if (t === "card.deleted")
        return `deleted a card${title ? ` "${title}"` : ""}`;
      if (t === "member.added") return "added a member";
      if (t === "member.removed") return "removed a member";
      if (t === "comment.added") return "added a comment";
      if (t.startsWith("board.list_"))
        return t.replace("board.", "").replace("_", " ");
      return type?.toString() || "activity";
    };

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      const s = String(val);
      if (
        s.includes('"') ||
        s.includes(",") ||
        s.includes("\n") ||
        s.includes("\r")
      ) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const toRecord = (v: unknown): Record<string, unknown> =>
      typeof v === "object" && v !== null && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : {};

    const header = [
      "ID",
      "Board ID",
      "Card ID",
      "Type",
      "Description",
      "User",
      "User ID",
      "Created At",
      "Metadata",
    ];

    type ActivityWithUser = Prisma.ActivityGetPayload<{
      include: {
        user: {
          select: {
            id: true;
            username: true;
            firstName: true;
            lastName: true;
            avatar: true;
          };
        };
      };
    }>;

    const rows = (activities as ActivityWithUser[]).map((a) => {
      const description = buildDescription(a.type, toRecord(a.data ?? {}));
      const userLabel = a.user?.firstName || a.user?.username || "";
      const metadata = JSON.stringify(toRecord(a.data ?? {}));
      return [
        a.id,
        a.boardId ?? "",
        a.cardId ?? "",
        toDotType(a.type),
        description,
        userLabel,
        a.userId ?? "",
        a.createdAt instanceof Date
          ? a.createdAt.toISOString()
          : new Date(a.createdAt as unknown as string).toISOString(),
        metadata,
      ]
        .map(escapeCsv)
        .join(",");
    });
    const csv = [header.join(","), ...rows].join("\n");
    return csv;
  }

  async listTemplates(userId: string) {
    const customTemplates = await this.prisma.boardTemplate.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
    });

    const customMapped = customTemplates.map((t) => {
      const s = t.structure as unknown as TemplateStructure;
      return {
        id: t.id,
        name: t.name,
        description: t.description || "",
        icon: t.icon,
        color: t.color,
        lists: Array.isArray(s?.lists) ? s.lists : [],
        isCustom: t.isCustom,
      };
    });
    return customMapped;
  }

  async saveAsTemplate(boardId: string, userId: string) {
    const board = await this.findOne(boardId, userId);

    // Permission: owner or admin members can save templates
    const member = board.members.find((m) => m.userId === userId);
    const canSave =
      board.ownerId === userId ||
      (member &&
        (
          [BoardMemberRole.OWNER, BoardMemberRole.ADMIN] as BoardMemberRole[]
        ).includes(member.role));
    if (!canSave) {
      throw new ForbiddenException("Insufficient permissions to save template");
    }

    const structure: TemplateStructure = {
      lists: (board.lists || []).map((list) => ({
        title: list.title,
        position: list.position,
        cards: (list.cards || []).map((card) => ({
          title: card.title,
          description: card.description ?? null,
          position: card.position,
        })),
      })),
    };

    const template = await this.prisma.boardTemplate.create({
      data: {
        name: board.title,
        description: `Template saved from board "${board.title}"`,
        icon: "Layout",
        color: board.color || "#6366f1",
        structure: structure as unknown as Prisma.InputJsonValue,
        isCustom: true,
        ownerId: userId,
      },
    });

    return template;
  }

  async createLabel(
    boardId: string,
    name: string,
    color: string,
    userId: string,
    userRole?: string,
  ) {
    // Verify user has access to the board
    await this.findOne(boardId, userId, userRole);

    // Check if label with same name already exists on this board
    const existing = await this.prisma.label.findFirst({
      where: {
        boardId,
        name,
      },
    });

    if (existing) {
      throw new BadRequestException(
        "Label with this name already exists on this board",
      );
    }

    const label = await this.prisma.label.create({
      data: {
        name,
        color,
        boardId,
      },
    });

    // Emit real-time event
    this.ws.notifyBoardUpdate(boardId, { type: "label_created", label });

    return label;
  }

  async getLabels(boardId: string, userId: string, userRole?: string) {
    // Verify user has access to the board
    await this.findOne(boardId, userId, userRole);

    return this.prisma.label.findMany({
      where: { boardId },
      orderBy: { createdAt: "asc" },
    });
  }
}
