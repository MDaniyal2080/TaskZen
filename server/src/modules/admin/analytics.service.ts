import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SystemSettingsService } from '../../common/services/system-settings.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService, private readonly systemSettings: SystemSettingsService) {}

  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      proUsers,
      totalBoards,
      totalCards,
      completedCards,
      recentActivities,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isPro: true } }),
      this.prisma.board.count(),
      this.prisma.card.count(),
      this.prisma.card.count({ where: { isCompleted: true } }),
      this.getRecentActivities(),
    ]);

    const completionRate = totalCards > 0 ? (completedCards / totalCards) * 100 : 0;

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        pro: proUsers,
        free: totalUsers - proUsers,
      },
      boards: {
        total: totalBoards,
        averagePerUser: totalUsers > 0 ? totalBoards / totalUsers : 0,
      },
      cards: {
        total: totalCards,
        completed: completedCards,
        pending: totalCards - completedCards,
        completionRate: Math.round(completionRate * 100) / 100,
      },
      recentActivities,
    };
  }

  async getUserGrowth(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const users = await this.prisma.user.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        createdAt: true,
        isPro: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group users by date
    const growthData: Record<string, { total: number; pro: number; free: number }> = {};
    users.forEach(user => {
      const date = user.createdAt.toISOString().split('T')[0];
      if (!growthData[date]) {
        growthData[date] = { total: 0, pro: 0, free: 0 };
      }
      growthData[date].total++;
      if (user.isPro) {
        growthData[date].pro++;
      } else {
        growthData[date].free++;
      }
    });

    return Object.entries(growthData).map(([date, data]) => ({
      date,
      ...data,
    }));
  }

  async getBoardStats() {
    const boards = await this.prisma.board.findMany({
      include: {
        _count: {
          select: {
            lists: true,
            members: true,
          },
        },
      },
    });

    const stats = boards.map(board => ({
      id: board.id,
      title: board.title,
      listsCount: board._count.lists,
      membersCount: board._count.members,
      isPrivate: board.isPrivate,
      isArchived: board.isArchived,
      createdAt: board.createdAt,
    }));

    return {
      boards: stats,
      totalBoards: boards.length,
      privateBoards: boards.filter(b => b.isPrivate).length,
      archivedBoards: boards.filter(b => b.isArchived).length,
      averageLists: stats.reduce((acc, b) => acc + b.listsCount, 0) / (boards.length || 1),
      averageMembers: stats.reduce((acc, b) => acc + b.membersCount, 0) / (boards.length || 1),
    };
  }

  async getActivityMetrics(days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const activities = await this.prisma.activity.groupBy({
      by: ['type', 'createdAt'],
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      _count: {
        id: true,
      },
    });

    // Process activities by day and type
    const metricsMap = new Map<string, Record<string, number>>();
    
    activities.forEach(activity => {
      const date = activity.createdAt.toISOString().split('T')[0];
      const key = `${date}-${activity.type}`;
      
      if (!metricsMap.has(date)) {
        metricsMap.set(date, {} as Record<string, number>);
      }
      
      const dayMetrics = metricsMap.get(date)!;
      dayMetrics[activity.type] = (dayMetrics[activity.type] || 0) + activity._count.id;
    });

    return Array.from(metricsMap.entries()).map(([date, metrics]) => ({
      date,
      ...metrics,
    }));
  }

  async getFeatureUsage() {
    const [
      labelsUsage,
      attachmentsUsage,
      commentsCount,
      dueDatesSet,
    ] = await Promise.all([
      this.prisma.label.count(),
      this.prisma.attachment.count(),
      this.prisma.comment.count(),
      this.prisma.card.count({
        where: {
          dueDate: {
            not: null,
          },
        },
      }),
    ]);

    return {
      labels: labelsUsage,
      attachments: attachmentsUsage,
      comments: commentsCount,
      dueDates: dueDatesSet,
    };
  }

  async getRevenueMetrics() {
    const proUsers = await this.prisma.user.findMany({
      where: { isPro: true },
      select: {
        id: true,
        createdAt: true,
        proExpiresAt: true,
      },
    });

    const settings = await this.systemSettings.getSettings();
    const monthlyPrice = Number((settings as any)?.payments?.monthlyPrice ?? 9.99);
    const monthlyRevenue = proUsers.length * monthlyPrice;
    const yearlyProjection = monthlyRevenue * 12;
    const averageCustomerLifetime = this.calculateAverageLifetime(proUsers);

    return {
      monthlyRecurringRevenue: parseFloat(monthlyRevenue.toFixed(2)),
      yearlyProjection: parseFloat(yearlyProjection.toFixed(2)),
      totalProUsers: proUsers.length,
      averageCustomerLifetime: parseFloat(averageCustomerLifetime.toFixed(2)),
      churnRate: parseFloat(this.calculateChurnRate(proUsers).toFixed(2)),
    };
  }

  private calculateAverageLifetime(proUsers: any[]) {
    if (proUsers.length === 0) return 0;
    
    const lifetimes = proUsers.map(user => {
      const start = new Date(user.createdAt);
      const end = user.proExpiresAt ? new Date(user.proExpiresAt) : new Date();
      return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24); // Days
    });

    return lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length;
  }

  private calculateChurnRate(proUsers: any[]) {
    const now = new Date();
    const expiredUsers = proUsers.filter(user => 
      user.proExpiresAt && new Date(user.proExpiresAt) < now
    );
    
    return proUsers.length > 0 ? (expiredUsers.length / proUsers.length) * 100 : 0;
  }

  private async getRecentActivities(limit: number = 10) {
    return this.prisma.activity.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            avatar: true,
          },
        },
        board: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }
}
