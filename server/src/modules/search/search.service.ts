import { Injectable } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(query: string, userId: string, type?: 'all' | 'boards' | 'cards' | 'lists') {
    const searchTerm = `%${query.toLowerCase()}%`;
    const results: any = {};

    // Get user's accessible boards
    const accessibleBoards = await this.prisma.board.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
          { isPrivate: false },
        ],
      },
      select: { id: true },
    });

    const boardIds = accessibleBoards.map(b => b.id);

    // Search boards
    if (type === 'all' || type === 'boards') {
      results.boards = await this.prisma.board.findMany({
        where: {
          id: { in: boardIds },
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              lists: true,
              members: true,
            },
          },
        },
        take: 10,
      });
    }

    // Search lists
    if (type === 'all' || type === 'lists') {
      results.lists = await this.prisma.list.findMany({
        where: {
          boardId: { in: boardIds },
          title: { contains: query, mode: 'insensitive' },
        },
        include: {
          board: {
            select: {
              id: true,
              title: true,
            },
          },
          _count: {
            select: {
              cards: true,
            },
          },
        },
        take: 10,
      });
    }

    // Search cards
    if (type === 'all' || type === 'cards') {
      results.cards = await this.prisma.card.findMany({
        where: {
          list: {
            boardId: { in: boardIds },
          },
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          list: {
            select: {
              id: true,
              title: true,
              board: {
                select: {
                  id: true,
                  title: true,
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
        orderBy: {
          updatedAt: 'desc',
        },
        take: 20,
      });

      // Format card results
      if (results.cards) {
        results.cards = results.cards.map((card: any) => ({
          ...card,
          labels: card.labels.map((cl: any) => cl.label),
        }));
      }
    }

    // Log search activity for analytics
    await this.prisma.activity.create({
      data: {
        type: ActivityType.BOARD_UPDATED, // Using existing type for search activity
        userId,
        data: {
          action: 'search',
          query,
          resultsCount: {
            boards: results.boards?.length || 0,
            lists: results.lists?.length || 0,
            cards: results.cards?.length || 0,
          },
        },
      },
    });

    return results;
  }

  async getRecentSearches(userId: string) {
    const activities = await this.prisma.activity.findMany({
      where: {
        userId,
        type: ActivityType.BOARD_UPDATED,
        data: {
          path: ['action'],
          equals: 'search',
        },
      },
      select: {
        data: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    // Extract unique queries
    const queries = new Set<string>();
    const recentSearches: any[] = [];

    for (const activity of activities) {
      const data = activity.data as any;
      if (data.query && !queries.has(data.query)) {
        queries.add(data.query);
        recentSearches.push({
          query: data.query,
          timestamp: activity.createdAt,
        });
      }
      if (recentSearches.length >= 5) break;
    }

    return recentSearches;
  }

  async getSuggestions(query: string, userId: string) {
    const suggestions: string[] = [];

    // Get user's accessible boards
    const accessibleBoards = await this.prisma.board.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
          { isPrivate: false },
        ],
      },
      select: { id: true },
    });

    const boardIds = accessibleBoards.map(b => b.id);

    // Get board title suggestions
    const boards = await this.prisma.board.findMany({
      where: {
        id: { in: boardIds },
        title: { startsWith: query, mode: 'insensitive' },
      },
      select: { title: true },
      take: 3,
    });

    boards.forEach(b => suggestions.push(b.title));

    // Get card title suggestions
    const cards = await this.prisma.card.findMany({
      where: {
        list: {
          boardId: { in: boardIds },
        },
        title: { startsWith: query, mode: 'insensitive' },
      },
      select: { title: true },
      distinct: ['title'],
      take: 3,
    });

    cards.forEach(c => suggestions.push(c.title));

    // Get label suggestions
    const labels = await this.prisma.label.findMany({
      where: {
        boardId: { in: boardIds },
        name: { startsWith: query, mode: 'insensitive' },
      },
      select: { name: true },
      distinct: ['name'],
      take: 2,
    });

    labels.forEach(l => suggestions.push(`label:${l.name}`));

    return [...new Set(suggestions)].slice(0, 8);
  }
}
