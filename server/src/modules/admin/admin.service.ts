import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SystemSettingsService } from '../../common/services/system-settings.service';
import { UserRole, TransactionStatus } from '@prisma/client';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private readonly systemSettings: SystemSettingsService) {}

  private checkAdminRole(userRole: UserRole) {
    if (userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
  }

  async getDashboardStats(userRole: UserRole) {
    this.checkAdminRole(userRole);

    const [totalUsers, totalBoards, totalCards, activeUsers, proUsers, adminUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.board.count(),
      this.prisma.card.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isPro: true } }),
      this.prisma.user.count({ where: { role: UserRole.ADMIN } }),
    ]);

    // Get total tasks count for dashboard
    const totalTasks = totalCards; // In this system, cards are tasks

    return {
      totalUsers,
      totalBoards,
      totalCards,
      totalTasks,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      proUsers,
      adminUsers,
    };
  }

  async getAllUsers(userRole: UserRole) {
    this.checkAdminRole(userRole);

    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        isPro: true,
        proExpiresAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            boards: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllBoards(userRole: UserRole) {
    this.checkAdminRole(userRole);

    return this.prisma.board.findMany({
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        _count: {
          select: {
            members: true,
            lists: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deactivateUser(userId: string, adminRole: UserRole) {
    this.checkAdminRole(adminRole);

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
  }

  async activateUser(userId: string, adminRole: UserRole) {
    this.checkAdminRole(adminRole);

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });
  }

  async upgradeUserToPro(userId: string, adminRole: UserRole) {
    this.checkAdminRole(adminRole);

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isPro: true,
        proExpiresAt: expiresAt,
      },
    });
  }

  async makeUserAdmin(userId: string, adminRole: UserRole) {
    this.checkAdminRole(adminRole);

    return this.prisma.user.update({
      where: { id: userId },
      data: { role: UserRole.ADMIN },
    });
  }

  async removeAdminRole(userId: string, adminRole: UserRole) {
    this.checkAdminRole(adminRole);

    return this.prisma.user.update({
      where: { id: userId },
      data: { role: UserRole.USER },
    });
  }

  /**
   * Update a user's subscription. Maps UI fields to existing schema (isPro, proExpiresAt).
   * Unsupported plans like ENTERPRISE will be rejected until schema supports them.
   */
  async updateUserSubscription(
    userId: string,
    adminRole: UserRole,
    data: { type: 'FREE' | 'PRO' | 'ENTERPRISE'; billingCycle?: 'MONTHLY' | 'YEARLY'; status?: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' },
  ) {
    this.checkAdminRole(adminRole);

    const { type, billingCycle = 'YEARLY', status = 'ACTIVE' } = data;

    if (type === 'ENTERPRISE') {
      throw new BadRequestException('Enterprise plan is not supported yet');
    }

    // If moving to FREE or cancelling, clear pro flags
    if (type === 'FREE' || status === 'CANCELLED') {
      return this.prisma.user.update({
        where: { id: userId },
        data: { isPro: false, proExpiresAt: null },
      });
    }

    // Handle PRO plan
    const now = new Date();
    const expiresAt = new Date(now);

    if (status === 'EXPIRED') {
      // Set to a past date to reflect expiration
      expiresAt.setDate(expiresAt.getDate() - 1);
    } else {
      if (billingCycle === 'MONTHLY') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { isPro: true, proExpiresAt: expiresAt },
    });
  }

  /**
   * Permanently delete a user and clean up nullable relations that don't cascade.
   */
  async deleteUser(userId: string, adminRole: UserRole) {
    this.checkAdminRole(adminRole);

    return this.prisma.$transaction(async (tx) => {
      // Null out assignee on cards that reference this user
      await tx.card.updateMany({ where: { assigneeId: userId }, data: { assigneeId: null } });
      // Null out activity user reference (optional relation but FK may restrict delete)
      await tx.activity.updateMany({ where: { userId }, data: { userId: null } });

      // Cascade deletes handle owned boards, memberships, comments, templates, etc.
      return tx.user.delete({ where: { id: userId } });
    });
  }

  async deleteBoard(boardId: string, adminRole: UserRole) {
    this.checkAdminRole(adminRole);

    return this.prisma.board.delete({
      where: { id: boardId },
    });
  }

  /**
   * Return a list of mock revenue transactions for the admin revenue page.
   * This simulates a billing provider. No transactions table exists yet.
   */
  async getMockTransactions(userRole: UserRole, limit: number = 25) {
    this.checkAdminRole(userRole);

    // Fetch a sample of users to attribute transactions to
    const users = await this.prisma.user.findMany({
      take: Math.min(limit, 100),
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, username: true, isPro: true, createdAt: true },
    });

    // Create mock transactions
    const statuses = ['succeeded', 'pending', 'refunded', 'failed'] as const;
    const plans = ['Pro Monthly', 'Pro Annual'] as const;
    const now = new Date();

    const settings = await this.systemSettings.getSettings();
    const monthlyPrice = Number((settings as any)?.payments?.monthlyPrice ?? 9.99);
    const yearlyPrice = Number((settings as any)?.payments?.yearlyPrice ?? monthlyPrice * 12);
    const currency = (settings as any)?.payments?.currency || 'USD';

    const items = Array.from({ length: limit }).map((_, i) => {
      const u = users[i % (users.length || 1)] || {
        id: 'user_mock',
        email: `user${i}@example.com`,
        username: `user${i}`,
        isPro: Math.random() > 0.3,
        createdAt: now,
      };
      const plan = plans[Math.random() < 0.7 ? 0 : 1];
      const amount = plan === 'Pro Annual' ? yearlyPrice : monthlyPrice;
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const daysAgo = Math.floor(Math.random() * 60);
      const createdAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      return {
        id: `txn_${createdAt.getTime()}_${i}`,
        userId: u.id,
        email: u.email,
        username: u.username,
        plan,
        amount,
        currency,
        status,
        createdAt: createdAt.toISOString(),
      };
    });

    // Sort newest first
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return {
      total: items.length,
      transactions: items,
    };
  }

  async getAnalytics(userRole: UserRole, timeRange?: string) {
    this.checkAdminRole(userRole);

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Fetch all metrics in parallel including comprehensive task metrics
    const [
      totalUsers,
      activeUsers,
      totalBoards,
      proUsers,
      userGrowth,
      boardGrowth,
      recentUsers,
      mostActiveBoards,
      taskMetrics, // New comprehensive task metrics
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.board.count(),
      this.prisma.user.count({ where: { isPro: true } }),
      
      // User growth calculation
      this.prisma.user.count({
        where: { createdAt: { gte: startDate } },
      }),
      
      // Board growth calculation
      this.prisma.board.count({
        where: { createdAt: { gte: startDate } },
      }),
      
      // Recent user activity
      this.prisma.user.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      
      // Most active boards
      this.prisma.board.findMany({
        take: 10,
        select: {
          id: true,
          title: true,
          _count: {
            select: {
              lists: true,
            },
          },
        },
        orderBy: {
          lists: {
            _count: 'desc',
          },
        },
      }),
      
      // Get comprehensive task metrics
      this.getTaskMetrics(startDate),
    ]);
    
    // Compute averages across all boards (real, not placeholder)
    const allBoardsCounts = await this.prisma.board.findMany({
      select: { _count: { select: { lists: true } } },
    });
    const avgListsPerBoard = allBoardsCounts.length
      ? allBoardsCounts.reduce((sum, b) => sum + b._count.lists, 0) / allBoardsCounts.length
      : 0;

    // Calculate growth percentages
    const previousUsers = totalUsers - userGrowth;
    const userGrowthPercent = previousUsers > 0 ? ((userGrowth / previousUsers) * 100) : 0;
    
    const previousBoards = totalBoards - boardGrowth;
    const boardGrowthPercent = previousBoards > 0 ? ((boardGrowth / previousBoards) * 100) : 0;

    // Process user activity for charts
    const dailyActivity = this.groupByDay(recentUsers);
    const monthlyRevenue = await this.calculateMonthlyRevenueSeries(12);

    // Task growth: compare current period vs previous equal-length period
    const periodMs = now.getTime() - startDate.getTime();
    const prevStartDate = new Date(startDate.getTime() - periodMs);
    const [tasksCreatedCurrent, tasksCreatedPrev] = await Promise.all([
      this.prisma.card.count({ where: { createdAt: { gte: startDate } } }),
      this.prisma.card.count({ where: { createdAt: { gte: prevStartDate, lt: startDate } } }),
    ]);
    const taskGrowthPercent = tasksCreatedPrev > 0
      ? ((tasksCreatedCurrent - tasksCreatedPrev) / tasksCreatedPrev) * 100
      : 0;

    // Revenue growth: compare succeeded transaction sums for current vs previous period
    const [txCurrent, txPrev] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { status: TransactionStatus.SUCCEEDED, createdAt: { gte: startDate } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { status: TransactionStatus.SUCCEEDED, createdAt: { gte: prevStartDate, lt: startDate } },
        _sum: { amount: true },
      }),
    ]).catch(() => [{ _sum: { amount: 0 } }, { _sum: { amount: 0 } }] as any);
    const txCurrAmt = Number(txCurrent._sum.amount ?? 0);
    const txPrevAmt = Number(txPrev._sum.amount ?? 0);
    const revenueGrowthPercent = txPrevAmt > 0 ? ((txCurrAmt - txPrevAmt) / txPrevAmt) * 100 : 0;

    // Velocity trend: compare this month vs last full month
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthCompleted = await this.prisma.card.count({
      where: { isCompleted: true, updatedAt: { gte: lastMonthStart, lt: lastMonthEnd } },
    });
    const prevMonthDays = Math.max(1, Math.ceil((lastMonthEnd.getTime() - lastMonthStart.getTime()) / (1000 * 60 * 60 * 24)));
    const prevMonthVelocity = prevMonthCompleted / prevMonthDays;

    const completionTrend =
      taskMetrics.today.completionRate > taskMetrics.thisWeek.completionRate
        ? 'up'
        : taskMetrics.today.completionRate < taskMetrics.thisWeek.completionRate
          ? 'down'
          : 'stable';
    const velocityTrend =
      taskMetrics.thisMonth.velocity > prevMonthVelocity
        ? 'up'
        : taskMetrics.thisMonth.velocity < prevMonthVelocity
          ? 'down'
          : 'stable';

    const settings = await this.systemSettings.getSettings();
    const monthlyPrice = Number((settings as any)?.payments?.monthlyPrice ?? 9.99);

    return {
      overview: {
        totalUsers,
        activeUsers,
        totalBoards,
        totalTasks: taskMetrics.overview.total,
        completionRate: taskMetrics.overview.completionRate,
        avgTasksPerUser: taskMetrics.overview.avgPerUser,
        proUsers,
        revenue: proUsers * monthlyPrice,
      },
      growth: {
        userGrowth: userGrowthPercent,
        boardGrowth: boardGrowthPercent,
        taskGrowth: taskGrowthPercent,
        revenueGrowth: revenueGrowthPercent,
      },
      userActivity: {
        daily: dailyActivity,
        weekly: [], // Simplified for now
        monthly: [], // Simplified for now
      },
      // Enhanced task metrics with comprehensive data
      taskMetrics: {
        overview: taskMetrics.overview,
        today: taskMetrics.today,
        thisWeek: taskMetrics.thisWeek,
        thisMonth: taskMetrics.thisMonth,
        byStatus: taskMetrics.byStatus,
        byPriority: taskMetrics.byPriority,
        trends: {
          completionTrend,
          velocityTrend,
        }
      },
      boardMetrics: {
        avgListsPerBoard: Math.round(avgListsPerBoard * 10) / 10,
        avgCardsPerBoard: taskMetrics.overview.avgPerBoard,
        mostActiveBoards: mostActiveBoards.map(board => ({
          id: board.id,
          title: board.title,
          activity: board._count.lists,
        })),
      },
      revenue: {
        monthly: monthlyRevenue,
        byPlan: [
          { plan: 'Free', amount: 0, users: totalUsers - proUsers },
          { plan: 'Pro', amount: proUsers * monthlyPrice, users: proUsers },
        ],
        mrr: proUsers * monthlyPrice,
        arr: proUsers * monthlyPrice * 12,
        churnRate: 0, // Will be calculated when transaction history is available
      },
    };
  }

  private groupByDay(users: any[]) {
    const grouped = {};
    users.forEach(user => {
      const date = new Date(user.createdAt).toISOString().split('T')[0];
      grouped[date] = (grouped[date] || 0) + 1;
    });
    
    return Object.entries(grouped).map(([date, count]) => ({
      date,
      count: count as number,
    }));
  }

  private async calculateMonthlyRevenueSeries(months: number, now: Date = new Date()) {
    const series: { month: string; amount: number }[] = [];
    // Start from months-1 ago up to current month
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    for (let i = 0; i < months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);

      const agg = await this.prisma.transaction
        .aggregate({
          where: {
            status: TransactionStatus.SUCCEEDED,
            createdAt: { gte: monthStart, lt: monthEnd },
          },
          _sum: { amount: true },
        })
        .catch(() => ({ _sum: { amount: 0 } }) as any);

      const amount = Number(agg._sum.amount ?? 0);
      const label = monthStart.toLocaleString('default', { month: 'short', year: 'numeric' });
      series.push({ month: label, amount });
    }
    return series;
  }

  /**
   * Calculate comprehensive task metrics including completion rates, overdue tasks, and trends
   */
  private async getTaskMetrics(startDate: Date) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [
      totalTasks,
      completedTasks,
      completedToday,
      completedThisWeek,
      completedThisMonth,
      createdToday,
      createdThisWeek,
      overdueTasks,
      tasksByStatus,
      tasksByPriority,
      avgTasksPerUser,
      avgTasksPerBoard,
    ] = await Promise.all([
      // Total tasks
      this.prisma.card.count(),
      
      // Completed tasks (all time)
      this.prisma.card.count({ where: { isCompleted: true } }),
      
      // Completed today
      this.prisma.card.count({
        where: {
          isCompleted: true,
          updatedAt: { gte: today }
        }
      }),
      
      // Completed this week
      this.prisma.card.count({
        where: {
          isCompleted: true,
          updatedAt: { gte: weekAgo }
        }
      }),
      
      // Completed this month
      this.prisma.card.count({
        where: {
          isCompleted: true,
          updatedAt: { gte: monthAgo }
        }
      }),
      
      // Created today
      this.prisma.card.count({
        where: { createdAt: { gte: today } }
      }),
      
      // Created this week
      this.prisma.card.count({
        where: { createdAt: { gte: weekAgo } }
      }),
      
      // Overdue tasks (using dueDate field)
      this.prisma.card.count({
        where: {
          isCompleted: false,
          dueDate: { lt: now }
        }
      }),
      
      // Tasks by completion status
      Promise.all([
        this.prisma.card.count({ where: { isCompleted: false } }),
        this.prisma.card.count({ where: { isCompleted: true } }),
      ]),
      
      // Tasks by priority
      this.prisma.card.groupBy({
        by: ['priority'],
        _count: { _all: true },
        orderBy: { _count: { _all: 'desc' } }
      }),
      
      // Average tasks per user
      this.prisma.user.findMany({
        select: {
          _count: {
            select: { cards: true }
          }
        }
      }).then(users => {
        const total = users.reduce((sum, u) => sum + u._count.cards, 0);
        return users.length > 0 ? total / users.length : 0;
      }),
      
      // Average tasks per board
      this.prisma.board.findMany({
        select: {
          _count: {
            select: { lists: true }
          },
          lists: {
            select: {
              _count: {
                select: { cards: true }
              }
            }
          }
        }
      }).then(boards => {
        let totalCards = 0;
        boards.forEach(board => {
          board.lists.forEach(list => {
            totalCards += list._count.cards;
          });
        });
        return boards.length > 0 ? totalCards / boards.length : 0;
      }),
    ]);

    // Calculate metrics
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const todayCompletionRate = createdToday > 0 ? (completedToday / createdToday) * 100 : 0;
    const weeklyCompletionRate = createdThisWeek > 0 ? (completedThisWeek / createdThisWeek) * 100 : 0;
    
    // Task velocity (tasks completed per day average)
    const daysInPeriod = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const taskVelocity = daysInPeriod > 0 ? completedThisMonth / daysInPeriod : 0;

    return {
      overview: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: tasksByStatus[0],
        overdue: overdueTasks,
        completionRate: Math.round(completionRate * 10) / 10,
        avgPerUser: Math.round(avgTasksPerUser * 10) / 10,
        avgPerBoard: Math.round(avgTasksPerBoard * 10) / 10,
      },
      today: {
        created: createdToday,
        completed: completedToday,
        completionRate: Math.round(todayCompletionRate * 10) / 10,
      },
      thisWeek: {
        created: createdThisWeek,
        completed: completedThisWeek,
        completionRate: Math.round(weeklyCompletionRate * 10) / 10,
      },
      thisMonth: {
        completed: completedThisMonth,
        velocity: Math.round(taskVelocity * 10) / 10,
      },
      byPriority: tasksByPriority.map(item => ({
        priority: item.priority || 'None',
        count: (item as any)._count?._all ?? 0,
      })),
      byStatus: [
        { status: 'To Do', count: tasksByStatus[0], color: 'text-yellow-600' },
        { status: 'Completed', count: tasksByStatus[1], color: 'text-green-600' },
      ],
    };
  }

  async exportAnalytics(userRole: UserRole, format: 'csv' | 'pdf') {
    this.checkAdminRole(userRole);
    
    const analytics = await this.getAnalytics(userRole);
    const settings = await this.systemSettings.getSettings();
    const currency = ((settings as any)?.payments?.currency || 'USD') as string;
    
    if (format === 'csv') {
      // Generate CSV
      let csv = 'Metric,Value\n';
      csv += `Total Users,${analytics.overview.totalUsers}\n`;
      csv += `Active Users,${analytics.overview.activeUsers}\n`;
      csv += `Total Boards,${analytics.overview.totalBoards}\n`;
      csv += `Total Tasks,${analytics.overview.totalTasks}\n`;
      csv += `Pro Users,${analytics.overview.proUsers}\n`;
      csv += `Monthly Revenue,${currency} ${Number(analytics.revenue.mrr).toFixed(2)}\n`;
      csv += `Annual Revenue,${currency} ${Number(analytics.revenue.arr).toFixed(2)}\n`;
      csv += `Completion Rate,${analytics.overview.completionRate.toFixed(1)}%\n`;
      csv += `Avg Tasks per User,${analytics.overview.avgTasksPerUser.toFixed(1)}\n`;
      
      return csv;
    } else {
      // Generate proper PDF using PDFKit
      return new Promise<Buffer>((resolve, reject) => {
        try {
          const doc = new PDFDocument();
          const buffers: Buffer[] = [];
          
          // Collect PDF data
          doc.on('data', buffers.push.bind(buffers));
          doc.on('end', () => {
            const pdfBuffer = Buffer.concat(buffers);
            resolve(pdfBuffer);
          });
          
          // PDF Header
          doc.fontSize(24).text('TaskZen Analytics Report', { align: 'center' });
          doc.moveDown();
          doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
          doc.moveDown(2);
          
          // Overview Section
          doc.fontSize(18).text('Overview', { underline: true });
          doc.moveDown();
          doc.fontSize(12);
          
          const overviewData = [
            ['Total Users', analytics.overview.totalUsers.toString()],
            ['Active Users', analytics.overview.activeUsers.toString()],
            ['Total Boards', analytics.overview.totalBoards.toString()],
            ['Total Tasks', analytics.overview.totalTasks.toString()],
            ['Pro Users', analytics.overview.proUsers.toString()],
            ['Completion Rate', `${analytics.overview.completionRate.toFixed(1)}%`],
            ['Avg Tasks per User', analytics.overview.avgTasksPerUser.toFixed(1)]
          ];
          
          overviewData.forEach(([label, value]) => {
            doc.text(`${label}: ${value}`);
            doc.moveDown(0.5);
          });
          
          doc.moveDown();
          
          // Revenue Section
          doc.fontSize(18).text('Revenue', { underline: true });
          doc.moveDown();
          doc.fontSize(12);
          
          const revenueData = [
            ['Monthly Recurring Revenue (MRR)', `${currency} ${Number(analytics.revenue.mrr).toFixed(2)}`],
            ['Annual Recurring Revenue (ARR)', `${currency} ${Number(analytics.revenue.arr).toFixed(2)}`],
            ['Pro Users Revenue', `${currency} ${Number(analytics.revenue.byPlan.find(p => p.plan === 'Pro')?.amount || 0).toFixed(2)}`],
            ['Churn Rate', `${analytics.revenue.churnRate}%`]
          ];
          
          revenueData.forEach(([label, value]) => {
            doc.text(`${label}: ${value}`);
            doc.moveDown(0.5);
          });
          
          doc.moveDown();
          
          // Growth Section
          doc.fontSize(18).text('Growth Metrics', { underline: true });
          doc.moveDown();
          doc.fontSize(12);
          
          const growthData = [
            ['User Growth', `${analytics.growth.userGrowth}%`],
            ['Board Growth', `${analytics.growth.boardGrowth}%`],
            ['Task Growth', `${analytics.growth.taskGrowth}%`],
            ['Revenue Growth', `${analytics.growth.revenueGrowth}%`]
          ];
          
          growthData.forEach(([label, value]) => {
            doc.text(`${label}: ${value}`);
            doc.moveDown(0.5);
          });
          
          // Task Metrics Section
          doc.addPage();
          doc.fontSize(18).text('Task Metrics', { underline: true });
          doc.moveDown();
          doc.fontSize(12);
          
          doc.text(`Completion Rate: ${analytics.taskMetrics.overview.completionRate.toFixed(1)}%`);
          doc.moveDown(0.5);
          doc.text(`Overdue Tasks: ${analytics.taskMetrics.overview.overdue}`);
          doc.moveDown();
          
          // Task Status Distribution
          doc.text('Task Status Distribution:', { underline: true });
          doc.moveDown(0.5);
          analytics.taskMetrics.byStatus.forEach(status => {
            doc.text(`  ${status.status}: ${status.count}`);
            doc.moveDown(0.3);
          });
          
          doc.moveDown();
          
          // Task Priority Distribution
          doc.text('Task Priority Distribution:', { underline: true });
          doc.moveDown(0.5);
          analytics.taskMetrics.byPriority.forEach(priority => {
            doc.text(`  ${priority.priority}: ${priority.count}`);
            doc.moveDown(0.3);
          });
          
          // Board Metrics Section
          doc.moveDown();
          doc.fontSize(18).text('Board Metrics', { underline: true });
          doc.moveDown();
          doc.fontSize(12);
          
          doc.text(`Average Lists per Board: ${analytics.boardMetrics.avgListsPerBoard}`);
          doc.moveDown(0.5);
          doc.text(`Average Cards per Board: ${analytics.boardMetrics.avgCardsPerBoard}`);
          doc.moveDown();
          
          // Most Active Boards
          doc.text('Most Active Boards:', { underline: true });
          doc.moveDown(0.5);
          analytics.boardMetrics.mostActiveBoards.slice(0, 5).forEach((board, index) => {
            doc.text(`  ${index + 1}. ${board.title} (Activity: ${board.activity})`);
            doc.moveDown(0.3);
          });
          
          // Footer
          doc.fontSize(10).text(
            'This report was generated automatically by TaskZen Analytics.',
            50,
            doc.page.height - 50,
            { align: 'center' }
          );
          
          doc.end();
        } catch (error) {
          reject(error);
        }
      });
    }
  }

  // Content Moderation Methods
  async getFlaggedContent(status?: string) {
    // Mock data for flagged content - in production, this would query a reports table
    const mockFlaggedContent = [
      {
        id: '1',
        type: 'board',
        content: {
          title: 'Inappropriate Board Name',
          description: 'This board contains offensive content'
        },
        reporter: {
          id: 'user1',
          username: 'reporter1',
          email: 'reporter1@example.com'
        },
        reportedUser: {
          id: 'user2',
          username: 'violator1',
          email: 'violator1@example.com'
        },
        reason: 'Offensive language',
        status: status || 'pending',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        type: 'card',
        content: {
          title: 'Spam Task',
          description: 'Repeated spam content'
        },
        reporter: {
          id: 'user3',
          username: 'reporter2',
          email: 'reporter2@example.com'
        },
        reportedUser: {
          id: 'user4',
          username: 'spammer1',
          email: 'spammer1@example.com'
        },
        reason: 'Spam',
        status: 'pending',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      }
    ];

    // Filter by status if provided
    if (status && status !== 'all') {
      return mockFlaggedContent.filter(item => item.status === status);
    }
    
    return mockFlaggedContent;
  }

  async getModeratedUsers() {
    // Get users with violation tracking - mock implementation
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
        boards: {
          select: { id: true }
        },
        cards: {
          select: { id: true }
        }
      },
      take: 20
    });

    // Add mock violation data
    return users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      status: 'active' as const,
      violations: Math.floor(Math.random() * 5),
      lastViolation: Math.random() > 0.5 ? new Date(Date.now() - Math.random() * 30 * 86400000).toISOString() : null,
      boards: user.boards.length,
      cards: user.cards.length,
      comments: Math.floor(Math.random() * 20),
      createdAt: user.createdAt.toISOString()
    }));
  }

  async reviewContent(contentId: string, action: 'approve' | 'remove' | 'dismiss', reviewerId: string) {
    // Mock implementation - in production, this would update the reports table
    const reviewData = {
      contentId,
      action,
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
      status: action === 'approve' ? 'resolved' : action === 'dismiss' ? 'dismissed' : 'removed'
    };

    // In production, you would:
    // 1. Update the report status
    // 2. If action is 'remove', delete or hide the content
    // 3. If action is 'remove', increment user violations
    // 4. Send notification to the reported user
    
    return {
      success: true,
      message: `Content ${action}d successfully`,
      data: reviewData
    };
  }

  async moderateUser(userId: string, action: 'warn' | 'suspend' | 'ban' | 'activate') {
    // Mock implementation - in production, this would update user status
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // In production, you would:
    // 1. Update user status/role
    // 2. Send email notification
    // 3. Log the moderation action
    // 4. If suspended/banned, revoke active sessions
    
    const actionMessages = {
      warn: 'User has been warned',
      suspend: 'User has been suspended for 7 days',
      ban: 'User has been permanently banned',
      activate: 'User has been reactivated'
    };

    return {
      success: true,
      message: actionMessages[action],
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: action === 'activate' ? 'active' : action
      }
    };
  }

  // System Settings Methods (persisted in DB)
  async getSystemSettings() {
    const existing = await this.prisma.systemSettings.findUnique({ where: { id: 'default' } });

    const defaults = {
      general: {
        siteName: 'TaskZen',
        maxBoardsPerUser: 3,
        maxCardsPerBoard: 100,
        maxFileSize: 5, // MB
      },
      features: {
        enableRegistration: true,
        enableRealTimeUpdates: true,
        enableFileUploads: true,
        enableComments: true,
        enablePublicBoards: false,
        enableAnalytics: true,
      },
      security: {
        requireEmailVerification: false,
        enableTwoFactor: false,
        sessionTimeout: 10080, // 7 days in minutes
        passwordMinLength: 8,
        maxLoginAttempts: 5,
        enableRateLimiting: true,
        rateLimitRequests: 100,
        rateLimitWindow: 60, // seconds
      },
      maintenance: {
        enabled: false,
        message: 'We are currently performing scheduled maintenance. Please check back soon.',
        scheduledAt: null,
        estimatedDuration: null,
      },
      email: {
        enabled: false,
        provider: 'smtp',
        fromEmail: 'noreply@taskzen.app',
        fromName: 'TaskZen',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpUser: '',
        smtpPassword: '',
        templates: {
          welcome: true,
          passwordReset: true,
          emailVerification: true,
          subscription: true,
        },
      },
      payments: {
        enabled: true,
        provider: 'stripe',
        currency: 'USD',
        monthlyPrice: 9.99,
        yearlyPrice: 99.99,
        trialDays: 14,
      },
    };
    
    if (existing) {
      const sanitized = this.sanitizeAdminSettings(existing.data as any);
      // Merge with defaults to ensure no null/undefined values leak to clients
      return this.mergeWithDefaults(defaults as any, sanitized);
    }

    await this.prisma.systemSettings.create({ data: { id: 'default', data: defaults } });
    return defaults;
  }

  async updateSystemSettings(settings: any) {
    const current = await this.getSystemSettings();
    const sanitizedIncoming = this.sanitizeAdminSettings(settings);
    // Deep merge: prefer incoming values while preserving unspecified keys from current
    const merged = this.mergeWithDefaults(current, { ...current, ...sanitizedIncoming });
    await this.prisma.systemSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', data: merged },
      update: { data: merged },
    });
    await this.systemSettings.getSettings(true);
    return {
      success: true,
      message: 'Settings updated successfully',
      settings: merged,
    };
  }

  private sanitizeAdminSettings(s: any) {
    const copy = JSON.parse(JSON.stringify(s || {}));
    if (copy?.general) {
      delete copy.general.siteUrl;
      delete copy.general.supportEmail;
    }
    if (copy?.features) {
      delete copy.features.enableGoogleAuth;
      delete copy.features.enableEmailNotifications;
    }
    return copy;
  }

  // Deep-merge helper: fills null/undefined values from defaults recursively
  private mergeWithDefaults<T>(defaults: T, value: any): T {
    if (value === null || value === undefined) return defaults as T;

    // If defaults is an array, only accept array, else use defaults
    if (Array.isArray(defaults)) {
      return (Array.isArray(value) ? (value as any) : (defaults as any)) as T;
    }

    // If defaults is an object, merge per key
    if (typeof defaults === 'object' && defaults !== null) {
      const result: any = Array.isArray(defaults) ? [] : {};
      const keys = new Set([
        ...Object.keys(defaults as any),
        ...Object.keys((value as any) || {}),
      ]);
      keys.forEach((key) => {
        const defVal = (defaults as any)[key];
        const val = (value as any)[key];
        if (val === null || val === undefined || (typeof val === 'number' && Number.isNaN(val))) {
          result[key] = defVal;
        } else if (typeof defVal === 'object' && defVal !== null && !Array.isArray(defVal)) {
          result[key] = this.mergeWithDefaults(defVal, val);
        } else {
          result[key] = val;
        }
      });
      return result as T;
    }

    // Primitive defaults
    return (value === null || value === undefined ? defaults : value) as T;
  }

  async toggleMaintenanceMode(enabled: boolean) {
    const current = await this.getSystemSettings();
    const updated = {
      ...current,
      maintenance: {
        ...current.maintenance,
        enabled,
        message: enabled
          ? 'TaskZen is currently under maintenance. We\'ll be back shortly!'
          : 'Maintenance mode disabled',
      },
    };
    await this.prisma.systemSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', data: updated },
      update: { data: updated },
    });
    await this.systemSettings.getSettings(true);
    return {
      success: true,
      status: {
        enabled,
        enabledAt: enabled ? new Date().toISOString() : null,
        message: updated.maintenance.message,
      },
    };
  }

  /**
   * Revenue Transactions (DB-backed) with server-side filters and pagination
   */
  async getTransactions(
    userRole: UserRole,
    opts: { limit: number; offset?: number; status?: string; plan?: string; q?: string }
  ) {
    this.checkAdminRole(userRole);
    const { limit, offset = 0, status, plan, q } = opts;

    // Map UI status string to Prisma enum
    let statusFilter: TransactionStatus | undefined;
    if (status && status !== 'all') {
      const map: Record<string, TransactionStatus> = {
        succeeded: TransactionStatus.SUCCEEDED,
        pending: TransactionStatus.PENDING,
        refunded: TransactionStatus.REFUNDED,
        failed: TransactionStatus.FAILED,
      };
      statusFilter = map[status.toLowerCase() as keyof typeof map];
    }

    const where: any = {};
    if (plan && plan !== 'all') where.plan = plan;
    if (statusFilter) where.status = statusFilter;
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { id: { contains: term, mode: 'insensitive' } },
        { user: { is: { email: { contains: term, mode: 'insensitive' } } } },
        { user: { is: { username: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, username: true } },
        },
      }),
    ]);

    return {
      total,
      transactions: records.map((t) => ({
        id: t.id,
        userId: t.userId,
        email: t.user?.email ?? '',
        username: t.user?.username ?? '',
        plan: t.plan,
        amount: parseFloat((t as any).amount?.toString?.() ?? '0'),
        currency: t.currency,
        status: String(t.status).toLowerCase(),
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Export revenue transactions as CSV. Honors filters (status, plan, q) and ignores pagination.
   */
  async exportRevenueTransactionsCsv(
    userRole: UserRole,
    opts: { status?: string; plan?: string; q?: string }
  ) {
    this.checkAdminRole(userRole);
    const { status, plan, q } = opts || {};

    // Map UI status string to Prisma enum
    let statusFilter: TransactionStatus | undefined;
    if (status && status !== 'all') {
      const map: Record<string, TransactionStatus> = {
        succeeded: TransactionStatus.SUCCEEDED,
        pending: TransactionStatus.PENDING,
        refunded: TransactionStatus.REFUNDED,
        failed: TransactionStatus.FAILED,
      };
      statusFilter = map[status.toLowerCase() as keyof typeof map];
    }

    const where: any = {};
    if (plan && plan !== 'all') where.plan = plan;
    if (statusFilter) where.status = statusFilter;
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { id: { contains: term, mode: 'insensitive' } },
        { user: { is: { email: { contains: term, mode: 'insensitive' } } } },
        { user: { is: { username: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const records = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, username: true } },
      },
    });

    const header = ['id', 'userId', 'email', 'username', 'plan', 'amount', 'currency', 'status', 'createdAt'];
    const rows = records.map((t) => [
      t.id,
      t.userId,
      t.user?.email ?? '',
      t.user?.username ?? '',
      t.plan,
      parseFloat((t as any).amount?.toString?.() ?? '0').toFixed(2),
      t.currency,
      String(t.status).toLowerCase(),
      t.createdAt.toISOString(),
    ]);

    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
    return csv;
  }

  async getSystemHealth(userRole: UserRole) {
    this.checkAdminRole(userRole);

    const uptimeSec = process.uptime();
    const mem = process.memoryUsage();
    const memoryMB = Math.round(mem.rss / 1024 / 1024);

    let dbOk = false;
    let dbLatencyMs = 0;
    try {
      const t0 = Date.now();
      // Simple DB ping
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - t0;
      dbOk = true;
    } catch (e) {
      dbOk = false;
    }

    return {
      uptimeSec,
      memoryMB,
      dbOk,
      dbLatencyMs,
      node: process.version,
      env: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    };
  }

  async getRecentActivities(userRole: UserRole, limit: number = 10) {
    this.checkAdminRole(userRole);
    return this.prisma.activity.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, username: true, email: true, avatar: true },
        },
        board: {
          select: { id: true, title: true },
        },
      },
    });
  }
}
