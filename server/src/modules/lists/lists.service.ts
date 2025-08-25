import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { BoardMemberRole, ActivityType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BoardsService } from '../boards/boards.service';
import { CreateListDto, UpdateListDto } from './dto/list.dto';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class ListsService {
  constructor(
    private prisma: PrismaService,
    private boardsService: BoardsService,
    private ws: WebsocketGateway,
  ) {}

  async create(createListDto: CreateListDto, userId: string, userRole?: string) {
    // Verify user has access to the board and fetch members for role checks
    const board = await this.boardsService.findOne(createListDto.boardId, userId, userRole);

    // Restrict viewers
    const member = board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot create lists');
    }

    // Get the highest position for new list
    const lastList = await this.prisma.list.findFirst({
      where: { boardId: createListDto.boardId },
      orderBy: { position: 'desc' },
    });

    const position = lastList ? lastList.position + 1000 : 1000;

    const newList = await this.prisma.list.create({
      data: {
        ...createListDto,
        position,
      },
      include: {
        cards: {
          orderBy: { position: 'asc' },
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
        },
      },
    });

    // Emit real-time event
    this.ws.notifyListCreated(createListDto.boardId, newList);
    // Activity: list created
    const activity = await this.prisma.activity.create({
      data: {
        type: ActivityType.LIST_CREATED,
        userId,
        boardId: createListDto.boardId,
        data: { id: newList.id, title: newList.title, position: newList.position },
      },
      include: {
        user: {
          select: { id: true, username: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });
    this.ws.notifyActivityCreated(createListDto.boardId, activity);
    return newList;
  }

  async findAll(boardId: string, userId: string) {
    // Verify user has access to the board
    await this.boardsService.findOne(boardId, userId);

    return this.prisma.list.findMany({
      where: { 
        boardId,
        isArchived: false,
      },
      include: {
        cards: {
          where: { isArchived: false },
          orderBy: { position: 'asc' },
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
        },
      },
      orderBy: { position: 'asc' },
    });
  }

  async findOne(id: string, userId: string) {
    const list = await this.prisma.list.findUnique({
      where: { id },
      include: {
        board: {
          include: {
            members: true,
          },
        },
        cards: {
          orderBy: { position: 'asc' },
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
        },
      },
    });

    if (!list) {
      throw new NotFoundException('List not found');
    }

    // Verify user has access to the board
    await this.boardsService.findOne(list.boardId, userId);

    return list;
  }

  async update(id: string, updateListDto: UpdateListDto, userId: string, userRole?: string) {
    const list = await this.findOne(id, userId);

    // Restrict viewers
    const board = await this.boardsService.findOne(list.boardId, userId, userRole);
    const member = board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot update lists');
    }

    const updated = await this.prisma.list.update({
      where: { id },
      data: updateListDto,
      include: {
        cards: {
          orderBy: { position: 'asc' },
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
        },
      },
    });

    // Emit real-time event
    this.ws.notifyListUpdated(list.boardId, updated);
    // Activity: list updated
    const activity = await this.prisma.activity.create({
      data: {
        type: ActivityType.LIST_UPDATED,
        userId,
        boardId: list.boardId,
        data: { id, ...(updateListDto as any) },
      },
      include: {
        user: {
          select: { id: true, username: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });
    this.ws.notifyActivityCreated(list.boardId, activity);
    return updated;
  }

  async remove(id: string, userId: string, userRole?: string) {
    const list = await this.findOne(id, userId);

    // Restrict viewers
    const board = await this.boardsService.findOne(list.boardId, userId, userRole);
    const member = board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot delete lists');
    }

    // Activity: list deleted (emit before deletion)
    const activity = await this.prisma.activity.create({
      data: {
        type: ActivityType.LIST_DELETED,
        userId,
        boardId: list.boardId,
        data: { id, title: list.title },
      },
      include: {
        user: {
          select: { id: true, username: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });
    this.ws.notifyActivityCreated(list.boardId, activity);

    const removed = await this.prisma.list.delete({
      where: { id },
    });

    // Emit real-time event
    this.ws.notifyListDeleted(list.boardId, { id });
    return removed;
  }

  async updatePosition(id: string, position: number, userId: string, userRole?: string) {
    const list = await this.findOne(id, userId);

    // Restrict viewers
    const board = await this.boardsService.findOne(list.boardId, userId, userRole);
    const member = board.members.find((m) => m.userId === userId);
    if (member && member.role === BoardMemberRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot update lists');
    }

    // Load all non-archived lists for this board to compute the new order
    const lists = await this.prisma.list.findMany({
      where: { boardId: list.boardId, isArchived: false },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });

    const currentIndex = lists.findIndex((l) => l.id === id);
    if (currentIndex === -1) {
      // Should not happen since we already fetched the list
      throw new NotFoundException('List not found');
    }

    // Treat incoming `position` as target index and clamp
    const targetIndex = Math.max(0, Math.min(position, lists.length - 1));

    let reordered = lists;
    if (currentIndex !== targetIndex) {
      reordered = lists.slice();
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(targetIndex, 0, moved);
    }

    // Reindex all positions to sequential integers based on the new order
    const updates = reordered
      .map((l, idx) => (l.position !== idx ? this.prisma.list.update({ where: { id: l.id }, data: { position: idx } }) : null))
      .filter((u): u is NonNullable<typeof u> => Boolean(u));

    if (updates.length) {
      await this.prisma.$transaction(updates);
    }

    // Fetch the moved list after normalization so we can emit the event
    const updated = await this.prisma.list.findUnique({ where: { id } });

    // Emit real-time event (moved list only). Clients will reorder locally.
    this.ws.notifyListUpdated(list.boardId, updated!);

    // Activity: list position updated (use from/to indices)
    const activity = await this.prisma.activity.create({
      data: {
        type: ActivityType.LIST_UPDATED,
        userId,
        boardId: list.boardId,
        data: { id, fromPosition: currentIndex, toPosition: targetIndex },
      },
      include: {
        user: {
          select: { id: true, username: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });
    this.ws.notifyActivityCreated(list.boardId, activity);
    return updated;
  }
}
