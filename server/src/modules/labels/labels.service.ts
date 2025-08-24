import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class LabelsService {
  constructor(private prisma: PrismaService) {}

  async create(data: { name: string; color: string; boardId: string }, userId: string) {
    // Verify board exists and user has access
    const board = await this.prisma.board.findUnique({
      where: { id: data.boardId },
      include: { members: true },
    });

    if (!board) {
      throw new NotFoundException('Board not found');
    }

    // Check if user is owner or admin member
    const isOwner = board.ownerId === userId;
    const member = board.members.find(m => m.userId === userId);
    const canCreate = isOwner || member?.role === 'ADMIN';

    if (!canCreate) {
      throw new ForbiddenException('Only board owner and admins can create labels');
    }

    // Check if label with same name already exists
    const existingLabel = await this.prisma.label.findFirst({
      where: {
        boardId: data.boardId,
        name: data.name,
      },
    });

    if (existingLabel) {
      throw new BadRequestException('Label with this name already exists');
    }

    return this.prisma.label.create({
      data: {
        name: data.name,
        color: data.color,
        boardId: data.boardId,
      },
    });
  }

  async findByBoard(boardId: string) {
    return this.prisma.label.findMany({
      where: { boardId },
      orderBy: { name: 'asc' },
    });
  }

  async findByCard(cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        labels: {
          include: {
            label: true,
          },
        },
      },
    });

    if (!card) {
      throw new NotFoundException('Card not found');
    }

    return card.labels.map(cl => cl.label);
  }

  async addToCard(cardId: string, labelId: string, userId: string) {
    // Verify card and label exist
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        list: {
          include: {
            board: {
              include: { members: true },
            },
          },
        },
      },
    });

    if (!card) {
      throw new NotFoundException('Card not found');
    }

    const label = await this.prisma.label.findUnique({
      where: { id: labelId },
    });

    if (!label) {
      throw new NotFoundException('Label not found');
    }

    // Verify label belongs to the same board
    if (label.boardId !== card.list.board.id) {
      throw new BadRequestException('Label does not belong to this board');
    }

    // Check user has access to modify card
    const hasAccess = 
      card.list.board.ownerId === userId ||
      card.list.board.members.some(m => m.userId === userId && m.role !== 'VIEWER');

    if (!hasAccess) {
      throw new ForbiddenException('No permission to modify this card');
    }

    // Check if label is already assigned
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

    // Create activity log
    await this.prisma.activity.create({
      data: {
        type: 'CARD_UPDATED',
        userId,
        cardId,
        boardId: card.list.board.id,
        data: {
          action: 'label_added',
          labelName: label.name,
          cardTitle: card.title,
        },
      },
    });

    return cardLabel.label;
  }

  async removeFromCard(cardId: string, labelId: string, userId: string) {
    // Verify card exists and user has access
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        list: {
          include: {
            board: {
              include: { members: true },
            },
          },
        },
      },
    });

    if (!card) {
      throw new NotFoundException('Card not found');
    }

    const label = await this.prisma.label.findUnique({
      where: { id: labelId },
    });

    if (!label) {
      throw new NotFoundException('Label not found');
    }

    // Check user has access to modify card
    const hasAccess = 
      card.list.board.ownerId === userId ||
      card.list.board.members.some(m => m.userId === userId && m.role !== 'VIEWER');

    if (!hasAccess) {
      throw new ForbiddenException('No permission to modify this card');
    }

    const deleted = await this.prisma.cardLabel.delete({
      where: {
        cardId_labelId: {
          cardId,
          labelId,
        },
      },
    });

    // Create activity log
    await this.prisma.activity.create({
      data: {
        type: 'CARD_UPDATED',
        userId,
        cardId,
        boardId: card.list.board.id,
        data: {
          action: 'label_removed',
          labelName: label.name,
          cardTitle: card.title,
        },
      },
    });

    return deleted;
  }

  async update(id: string, data: { name?: string; color?: string }, userId: string) {
    const label = await this.prisma.label.findUnique({
      where: { id },
      include: {
        board: {
          include: { members: true },
        },
      },
    });

    if (!label) {
      throw new NotFoundException('Label not found');
    }

    // Check if user is owner or admin member
    const isOwner = label.board.ownerId === userId;
    const member = label.board.members.find(m => m.userId === userId);
    const canUpdate = isOwner || member?.role === 'ADMIN';

    if (!canUpdate) {
      throw new ForbiddenException('Only board owner and admins can update labels');
    }

    // Check if new name conflicts with existing label
    if (data.name && data.name !== label.name) {
      const existing = await this.prisma.label.findFirst({
        where: {
          boardId: label.boardId,
          name: data.name,
          NOT: { id },
        },
      });

      if (existing) {
        throw new BadRequestException('Label with this name already exists');
      }
    }

    return this.prisma.label.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.color && { color: data.color }),
      },
    });
  }

  async remove(id: string, userId: string) {
    const label = await this.prisma.label.findUnique({
      where: { id },
      include: {
        board: {
          include: { members: true },
        },
      },
    });

    if (!label) {
      throw new NotFoundException('Label not found');
    }

    // Check if user is owner or admin member
    const isOwner = label.board.ownerId === userId;
    const member = label.board.members.find(m => m.userId === userId);
    const canDelete = isOwner || member?.role === 'ADMIN';

    if (!canDelete) {
      throw new ForbiddenException('Only board owner and admins can delete labels');
    }

    // Delete all card-label associations first
    await this.prisma.cardLabel.deleteMany({
      where: { labelId: id },
    });

    return this.prisma.label.delete({
      where: { id },
    });
  }
}
