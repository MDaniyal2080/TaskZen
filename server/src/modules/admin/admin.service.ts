import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { SystemSettingsService } from "../../common/services/system-settings.service";
import { UserRole, TransactionStatus } from "@prisma/client";
import * as PDFDocument from "pdfkit";
import type { Prisma } from "@prisma/client";
import type { SystemSettingsShape } from "../../common/services/system-settings.service";


@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  // Simple in-memory cache for analytics to reduce DB load under frequent access
  private analyticsCache = new Map<string, { value: any; expiresAt: number }>();
  private get analyticsCacheTtlMs() {
    const n = Number(process.env.ADMIN_ANALYTICS_CACHE_TTL_MS || 20000);
    // clamp 5s - 60s
    return Math.min(60000, Math.max(5000, Number.isFinite(n) ? n : 20000));
  }

  // Small TTL caches to protect hot endpoints (revenue transactions, recent activities)
  private txCache = new Map<string, { value: any; expiresAt: number }>();
  private txInflight = new Map<string, Promise<any>>();
  private activitiesCache = new Map<string, { value: any; expiresAt: number }>();
  private activitiesInflight = new Map<string, Promise<any>>();
  private get smallCacheTtlMs() {
    const n = Number(process.env.ADMIN_SMALL_CACHE_TTL_MS || 3000);
    // clamp 1s - 10s
    return Math.min(10000, Math.max(1000, Number.isFinite(n) ? n : 3000));
  }

  // Access control for admin-only operations
  private checkAdminRole(role: UserRole) {
    if (role !== "ADMIN") {
      throw new ForbiddenException("Admin access required");
    }
  }

  private groupByDay(users: Array<{ createdAt: Date }>) {
    const grouped: Record<string, number> = {};
    users.forEach((user) => {
      const date = new Date(user.createdAt).toISOString().split("T")[0];
      grouped[date] = (grouped[date] || 0) + 1;
    });

    return Object.entries(grouped).map(([date, count]) => ({
      date,
      count,
    }));
  }

  // Fill zero-count gaps for daily series between start and end (inclusive)
  private fillDailySeries(
    start: Date,
    end: Date,
    entries: Array<{ date: string; count: number }>,
  ) {
    const map = new Map(entries.map((e) => [e.date, e.count]));
    const out: Array<{ date: string; count: number }> = [];
    const d0 = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const d1 = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
    );
    for (
      let d = d0;
      d.getTime() <= d1.getTime();
      d = new Date(d.getTime() + 86400000)
    ) {
      const key = d.toISOString().split("T")[0];
      out.push({ date: key, count: map.get(key) ?? 0 });
    }
    return out;
  }

  private getIsoWeekLabel(date: Date) {
    // ISO week number, label like YYYY-Www
    const d = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const dayNum = d.getUTCDay() || 7; // 1..7 (Mon..Sun)
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  private getMonthLabel(date: Date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  private async calculateMonthlyRevenueSeries(
    months: number,
    now: Date = new Date(),
  ) {
    // Compute a single time window [start, end) covering the last `months` months
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    // Pre-compute labels and YYYY-MM keys for each month to fill zeros
    const windows = Array.from({ length: months }, (_, i) => {
      const d = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1),
      );
      const label = d.toLocaleString("default", {
        month: "short",
        year: "numeric",
      });
      const ym = this.getMonthLabel(d); // YYYY-MM
      return { ym, label };
    });

    let rows: { ym: string; sum: number | null }[] = [];
    try {
      rows = await this.prisma.$queryRaw<
        { ym: string; sum: number | null }[]
      >`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS ym,
               SUM("amount")::float8 AS sum
        FROM "transactions"
        WHERE "status" = 'SUCCEEDED'
          AND "createdAt" >= ${start}
          AND "createdAt" < ${end}
        GROUP BY 1
        ORDER BY 1
      `;
    } catch {
      rows = [];
    }

    const map = new Map<string, number>(
      rows.map((r) => [r.ym, Number(r.sum ?? 0)]),
    );

    return windows.map((w) => ({
      month: w.label,
      amount: Number(map.get(w.ym) ?? 0),
    }));
  }

  async getAnalytics(userRole: UserRole, timeRange?: string) {
    this.checkAdminRole(userRole);
    // Parse time range
    const parseDays = (tr?: string) => {
      if (!tr) return 30;
      const t = tr.trim().toLowerCase();
      const mDays = /^([0-9]+)d$/.exec(t);
      if (mDays) return Math.max(1, Number(mDays[1]));
      const mYears = /^([0-9]+)y$/.exec(t);
      if (mYears) return Math.max(1, Number(mYears[1]) * 365);
      return 30;
    };
    const days = parseDays(timeRange);

    // Cache check
    const cacheKey = `analytics:${days}`;
    const nowMs = Date.now();
    const cached = this.analyticsCache.get(cacheKey);
    if (cached && cached.expiresAt > nowMs) {
      return cached.value;
    }

    const now = new Date();
    const startCurr = new Date(now);
    startCurr.setDate(now.getDate() - days);
    const startPrev = new Date(now);
    startPrev.setDate(now.getDate() - days * 2);
    const endPrev = startCurr;
    const growthPct = (curr: number, prev: number) =>
      prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;

    // Batch A: overview counts, overdue, userActivity source, and avg completion time
    const [
      totalUsers,
      activeUsers,
      proUsersCount,
      totalBoards,
      totalTasks,
      completedTasks,
      overdue,
      userCreationsInRange,
      avgCompletionRows,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isPro: true } }),
      this.prisma.board.count(),
      this.prisma.card.count(),
      this.prisma.card.count({ where: { isCompleted: true } }),
      this.prisma.card.count({
        where: { dueDate: { lt: new Date() }, isCompleted: false },
      }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: startCurr, lte: now } },
        select: { createdAt: true },
      }),
      this.prisma.$queryRaw<{ avg_days: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 86400) AS avg_days
        FROM "cards"
        WHERE "isCompleted" = true
          AND "updatedAt" IS NOT NULL
          AND "createdAt" >= ${startCurr}
          AND "createdAt" <= ${now}
      `,
    ]);

    // Settings fetched separately to avoid non-Prisma call inside transaction
    const settings: SystemSettingsShape =
      await this.systemSettings.getSettings();

    const completionRate =
      totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const avgTasksPerUser = totalUsers > 0 ? totalTasks / totalUsers : 0;
    const monthlyPrice = Number(
      (settings as SystemSettingsShape).payments?.monthlyPrice ?? 9.99,
    );
    const mrr = Number((proUsersCount * monthlyPrice).toFixed(2));
    const arr = Number((mrr * 12).toFixed(2));

    // Batch B: growth metrics, revenue aggregates, boards, proUsers for churn
    const [
      usersPrev,
      usersCurr,
      boardsPrev,
      boardsCurr,
      tasksPrev,
      tasksCurr,
      revPrevAgg,
      revCurrAgg,
      boards,
      proUsers,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({
        where: { createdAt: { gte: startPrev, lt: endPrev } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: startCurr, lte: now } },
      }),
      this.prisma.board.count({
        where: { createdAt: { gte: startPrev, lt: endPrev } },
      }),
      this.prisma.board.count({
        where: { createdAt: { gte: startCurr, lte: now } },
      }),
      this.prisma.card.count({
        where: { createdAt: { gte: startPrev, lt: endPrev } },
      }),
      this.prisma.card.count({
        where: { createdAt: { gte: startCurr, lte: now } },
      }),
      this.prisma.transaction.aggregate({
        where: {
          status: TransactionStatus.SUCCEEDED,
          createdAt: { gte: startPrev, lt: endPrev },
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          status: TransactionStatus.SUCCEEDED,
          createdAt: { gte: startCurr, lte: now },
        },
        _sum: { amount: true },
      }),
      this.prisma.board.findMany({
        include: { _count: { select: { lists: true, members: true } } },
      }),
      this.prisma.user.findMany({
        where: { isPro: true },
        select: { id: true, createdAt: true, proExpiresAt: true },
      }),
    ]);

    const revPrev = Number(revPrevAgg._sum.amount ?? 0);
    const revCurr = Number(revCurrAgg._sum.amount ?? 0);

    // Board metrics
    const avgListsPerBoard = boards.length
      ? boards.reduce((acc, b) => acc + b._count.lists, 0) / boards.length
      : 0;
    const avgCardsPerBoard = 0; // Keep simple for now
    const mostActiveBoards = boards
      .map((b) => ({
        id: b.id,
        title: b.title,
        activity: b._count.lists + b._count.members,
      }))
      .sort((a, b) => b.activity - a.activity)
      .slice(0, 5);

    // Churn rate estimation
    const nowD = new Date();
    const expired = proUsers.filter(
      (u) => u.proExpiresAt && new Date(u.proExpiresAt) < nowD,
    ).length;
    const churnRate =
      proUsers.length > 0
        ? Number(((expired / proUsers.length) * 100).toFixed(2))
        : 0;

    // User activity series
    const dailyRaw = this.groupByDay(userCreationsInRange);
    const daily = this.fillDailySeries(startCurr, now, dailyRaw);
    const weeklyMap = new Map<string, number>();
    const monthlyMap = new Map<string, number>();
    daily.forEach(({ date, count }) => {
      const d = new Date(`${date}T00:00:00.000Z`);
      const w = this.getIsoWeekLabel(d);
      const m = this.getMonthLabel(d);
      weeklyMap.set(w, (weeklyMap.get(w) ?? 0) + count);
      monthlyMap.set(m, (monthlyMap.get(m) ?? 0) + count);
    });
    const weekly = Array.from(weeklyMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([week, count]) => ({ week, count }));
    const monthly = Array.from(monthlyMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([month, count]) => ({ month, count }));

    // Avg completion time (days) from batch A raw query
    const avgCompletionTimeDays = Number(avgCompletionRows?.[0]?.avg_days ?? 0);

    // Monthly revenue series (single grouped query)
    const revenueMonthly = await this.calculateMonthlyRevenueSeries(12, now);

    const result = {
      overview: {
        totalUsers,
        activeUsers,
        totalBoards,
        totalTasks,
        proUsers: proUsersCount,
        completionRate,
        avgTasksPerUser,
      },
      revenue: {
        mrr,
        arr,
        monthly: revenueMonthly,
        byPlan: [
          {
            plan: "Pro",
            amount: Number((proUsersCount * monthlyPrice).toFixed(2)),
            users: proUsersCount,
          },
        ],
        churnRate,
      },
      growth: {
        userGrowth: Number(growthPct(usersCurr, usersPrev).toFixed(2)),
        boardGrowth: Number(growthPct(boardsCurr, boardsPrev).toFixed(2)),
        taskGrowth: Number(growthPct(tasksCurr, tasksPrev).toFixed(2)),
        revenueGrowth: Number(growthPct(revCurr, revPrev).toFixed(2)),
      },
      taskMetrics: {
        byStatus: [
          { status: "completed", count: completedTasks },
          {
            status: "pending",
            count: Math.max(totalTasks - completedTasks, 0),
          },
        ],
        byPriority: [],
        avgCompletionTime: Number(avgCompletionTimeDays.toFixed(1)),
        overdueTasks: overdue,
        // keep previous nested overview for backward compatibility
        overview: { completionRate, overdue },
      },
      boardMetrics: {
        avgListsPerBoard: Number(avgListsPerBoard.toFixed(2)),
        avgCardsPerBoard: Number(avgCardsPerBoard.toFixed(2)),
        mostActiveBoards,
      },
      userActivity: {
        daily,
        weekly,
        monthly,
      },
    };

    // Set cache
    this.analyticsCache.set(cacheKey, {
      value: result,
      expiresAt: Date.now() + this.analyticsCacheTtlMs,
    });

    return result;
  }

  async exportAnalytics(
    userRole: UserRole,
    format: "csv" | "pdf",
    timeRange?: string,
  ) {
    this.checkAdminRole(userRole);

    const analytics = await this.getAnalytics(userRole, timeRange);
    const settings: SystemSettingsShape =
      await this.systemSettings.getSettings();
    const currency = settings.payments?.currency || "USD";

    if (format === "csv") {
      // Generate CSV
      let csv = "Metric,Value\n";
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
          doc.on("data", buffers.push.bind(buffers));
          doc.on("end", () => {
            const pdfBuffer = Buffer.concat(buffers);
            resolve(pdfBuffer);
          });

          // PDF Header
          doc
            .fontSize(24)
            .text("TaskZen Analytics Report", { align: "center" });
          doc.moveDown();
          doc
            .fontSize(12)
            .text(`Generated on: ${new Date().toLocaleDateString()}`, {
              align: "center",
            });
          doc.moveDown(2);

          // Overview Section
          doc.fontSize(18).text("Overview", { underline: true });
          doc.moveDown();
          doc.fontSize(12);

          const overviewData = [
            ["Total Users", analytics.overview.totalUsers.toString()],
            ["Active Users", analytics.overview.activeUsers.toString()],
            ["Total Boards", analytics.overview.totalBoards.toString()],
            ["Total Tasks", analytics.overview.totalTasks.toString()],
            ["Pro Users", analytics.overview.proUsers.toString()],
            [
              "Completion Rate",
              `${analytics.overview.completionRate.toFixed(1)}%`,
            ],
            [
              "Avg Tasks per User",
              analytics.overview.avgTasksPerUser.toFixed(1),
            ],
          ];

          overviewData.forEach(([label, value]) => {
            doc.text(`${label}: ${value}`);
            doc.moveDown(0.5);
          });

          doc.moveDown();

          // Revenue Section
          doc.fontSize(18).text("Revenue", { underline: true });
          doc.moveDown();
          doc.fontSize(12);

          const revenueData = [
            [
              "Monthly Recurring Revenue (MRR)",
              `${currency} ${Number(analytics.revenue.mrr).toFixed(2)}`,
            ],
            [
              "Annual Recurring Revenue (ARR)",
              `${currency} ${Number(analytics.revenue.arr).toFixed(2)}`,
            ],
            [
              "Pro Users Revenue",
              `${currency} ${Number(analytics.revenue.byPlan.find((p) => p.plan === "Pro")?.amount || 0).toFixed(2)}`,
            ],
            ["Churn Rate", `${analytics.revenue.churnRate}%`],
          ];

          revenueData.forEach(([label, value]) => {
            doc.text(`${label}: ${value}`);
            doc.moveDown(0.5);
          });

          doc.moveDown();

          // Growth Section
          doc.fontSize(18).text("Growth Metrics", { underline: true });
          doc.moveDown();
          doc.fontSize(12);

          const growthData = [
            ["User Growth", `${analytics.growth.userGrowth}%`],
            ["Board Growth", `${analytics.growth.boardGrowth}%`],
            ["Task Growth", `${analytics.growth.taskGrowth}%`],
            ["Revenue Growth", `${analytics.growth.revenueGrowth}%`],
          ];

          growthData.forEach(([label, value]) => {
            doc.text(`${label}: ${value}`);
            doc.moveDown(0.5);
          });

          // Task Metrics Section
          doc.addPage();
          doc.fontSize(18).text("Task Metrics", { underline: true });
          doc.moveDown();
          doc.fontSize(12);

          doc.text(
            `Completion Rate: ${analytics.taskMetrics.overview.completionRate.toFixed(1)}%`,
          );
          doc.moveDown(0.5);
          doc.text(`Overdue Tasks: ${analytics.taskMetrics.overview.overdue}`);
          doc.moveDown();

          // Task Status Distribution
          doc.text("Task Status Distribution:", { underline: true });
          doc.moveDown(0.5);
          analytics.taskMetrics.byStatus.forEach((status) => {
            doc.text(`  ${status.status}: ${status.count}`);
            doc.moveDown(0.3);
          });

          doc.moveDown();

          // Task Priority Distribution
          doc.text("Task Priority Distribution:", { underline: true });
          doc.moveDown(0.5);
          analytics.taskMetrics.byPriority.forEach((priority) => {
            doc.text(`  ${priority.priority}: ${priority.count}`);
            doc.moveDown(0.3);
          });

          // Board Metrics Section
          doc.moveDown();
          doc.fontSize(18).text("Board Metrics", { underline: true });
          doc.moveDown();
          doc.fontSize(12);

          doc.text(
            `Average Lists per Board: ${analytics.boardMetrics.avgListsPerBoard}`,
          );
          doc.moveDown(0.5);
          doc.text(
            `Average Cards per Board: ${analytics.boardMetrics.avgCardsPerBoard}`,
          );
          doc.moveDown();

          // Most Active Boards
          doc.text("Most Active Boards:", { underline: true });
          doc.moveDown(0.5);
          analytics.boardMetrics.mostActiveBoards
            .slice(0, 5)
            .forEach((board, index) => {
              doc.text(
                `  ${index + 1}. ${board.title} (Activity: ${board.activity})`,
              );
              doc.moveDown(0.3);
            });

          // Footer
          doc
            .fontSize(10)
            .text(
              "This report was generated automatically by TaskZen Analytics.",
              50,
              doc.page.height - 50,
              { align: "center" },
            );

          doc.end();
        } catch (error) {
          reject(error);
        }
      });
    }
  }

  async getFlaggedContent(status?: string) {
    // Mock data for flagged content - in production, this would query a reports table
    const mockFlaggedContent = [
      {
        id: "1",
        type: "board",
        content: {
          title: "Inappropriate Board Name",
          description: "This board contains offensive content",
        },
        reporter: {
          id: "user1",
          username: "reporter1",
          email: "reporter1@example.com",
        },
        reportedUser: {
          id: "user2",
          username: "violator1",
          email: "violator1@example.com",
        },
        reason: "Offensive language",
        status: status || "pending",
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        type: "card",
        content: {
          title: "Spam Task",
          description: "Repeated spam content",
        },
        reporter: {
          id: "user3",
          username: "reporter2",
          email: "reporter2@example.com",
        },
        reportedUser: {
          id: "user4",
          username: "spammer1",
          email: "spammer1@example.com",
        },
        reason: "Spam",
        status: "pending",
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ];

    // Filter by status if provided
    if (status && status !== "all") {
      return mockFlaggedContent.filter((item) => item.status === status);
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
          select: { id: true },
        },
        cards: {
          select: { id: true },
        },
      },
      take: 20,
    });

    // Add mock violation data
    return users.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      status: "active" as const,
      violations: Math.floor(Math.random() * 5),
      lastViolation:
        Math.random() > 0.5
          ? new Date(Date.now() - Math.random() * 30 * 86400000).toISOString()
          : null,
      boards: user.boards.length,
      cards: user.cards.length,
      comments: Math.floor(Math.random() * 20),
      createdAt: user.createdAt.toISOString(),
    }));
  }

  async reviewContent(
    contentId: string,
    action: "approve" | "remove" | "dismiss",
    reviewerId: string,
  ) {
    // Mock implementation - in production, this would update the reports table
    const reviewData = {
      contentId,
      action,
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
      status:
        action === "approve"
          ? "resolved"
          : action === "dismiss"
            ? "dismissed"
            : "removed",
    };

    // In production, you would:
    // 1. Update the report status
    // 2. If action is 'remove', delete or hide the content
    // 3. If action is 'remove', increment user violations
    // 4. Send notification to the reported user

    return {
      success: true,
      message: `Content ${action}d successfully`,
      data: reviewData,
    };
  }

  async moderateUser(
    userId: string,
    action: "warn" | "suspend" | "ban" | "activate",
  ) {
    // Mock implementation - in production, this would update user status
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // In production, you would:
    // 1. Update user status/role
    // 2. Send email notification
    // 3. Log the moderation action
    // 4. If suspended/banned, revoke active sessions

    const actionMessages = {
      warn: "User has been warned",
      suspend: "User has been suspended for 7 days",
      ban: "User has been permanently banned",
      activate: "User has been reactivated",
    };

    return {
      success: true,
      message: actionMessages[action],
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: action === "activate" ? "active" : action,
      },
    };
  }

  async getSystemSettings() {
    const existing = await this.prisma.systemSettings.findUnique({
      where: { id: "default" },
    });

    const defaults: SystemSettingsShape = {
      general: {
        siteName: "TaskZen",
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
        message:
          "We are currently performing scheduled maintenance. Please check back soon.",
        scheduledAt: null,
        estimatedDuration: null,
      },
      email: {
        enabled: false,
        provider: "smtp",
        fromEmail: "noreply@taskzen.app",
        fromName: "TaskZen",
        smtpHost: "smtp.gmail.com",
        smtpPort: 587,
        smtpUser: "",
        smtpPassword: "",
        templates: {
          welcome: true,
          passwordReset: true,
          emailVerification: true,
          subscription: true,
        },
      },
      payments: {
        enabled: true,
        provider: "stripe",
        currency: "USD",
        monthlyPrice: 9.99,
        yearlyPrice: 99.99,
        trialDays: 14,
      },
    };

    if (existing) {
      const sanitized = this.sanitizeAdminSettings(existing.data);
      // Merge with defaults to ensure no null/undefined values leak to clients
      return this.mergeWithDefaults(defaults, sanitized);
    }

    await this.prisma.systemSettings.create({
      data: {
        id: "default",
        data: defaults as unknown as Prisma.InputJsonValue,
      },
    });
    return defaults;
  }

  async updateSystemSettings(settings: Partial<SystemSettingsShape>) {
    const current = await this.getSystemSettings();
    const sanitizedIncoming = this.sanitizeAdminSettings(settings);
    // Deep merge: prefer incoming values while preserving unspecified keys from current
    const merged = this.mergeWithDefaults(current, {
      ...current,
      ...sanitizedIncoming,
    });
    await this.prisma.systemSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        data: merged as unknown as Prisma.InputJsonValue,
      },
      update: { data: merged as unknown as Prisma.InputJsonValue },
    });
    // Immediately refresh in-memory cache to avoid stale reads
    this.systemSettings.setCache(merged);
    return {
      success: true,
      message: "Settings updated successfully",
      settings: merged,
    };
  }

  private sanitizeAdminSettings(s: unknown): Partial<SystemSettingsShape> {
    const obj = JSON.parse(JSON.stringify(s ?? {})) as unknown;
    if (obj && typeof obj === "object") {
      const o = obj as { [k: string]: unknown };
      const general = o["general"] as { [k: string]: unknown } | undefined;
      if (general) {
        delete general["siteUrl"];
        delete general["supportEmail"];
        o["general"] = general;
      }
      const features = o["features"] as { [k: string]: unknown } | undefined;
      if (features) {
        delete features["enableGoogleAuth"];
        delete features["enableEmailNotifications"];
        o["features"] = features;
      }
      return o as Partial<SystemSettingsShape>;
    }
    return {} as Partial<SystemSettingsShape>;
  }

  private mergeWithDefaults<T>(defaults: T, value: unknown): T {
    if (value === null || value === undefined) return defaults;

    // If defaults is an array, only accept array, else use defaults
    if (Array.isArray(defaults)) {
      return Array.isArray(value) ? (value as T) : defaults;
    }

    // If defaults is an object, merge per key
    if (typeof defaults === "object" && defaults !== null) {
      const defaultsObj = defaults as Record<string, unknown>;
      const valueObj =
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      const result: Record<string, unknown> = {};
      const keys = new Set([
        ...Object.keys(defaultsObj),
        ...Object.keys(valueObj),
      ]);
      keys.forEach((key) => {
        const defVal = defaultsObj[key];
        const val = valueObj[key];
        if (
          val === null ||
          val === undefined ||
          (typeof val === "number" && Number.isNaN(val as number))
        ) {
          result[key] = defVal;
        } else if (
          typeof defVal === "object" &&
          defVal !== null &&
          !Array.isArray(defVal)
        ) {
          result[key] = this.mergeWithDefaults(defVal, val);
        } else {
          result[key] = val;
        }
      });
      return result as T;
    }

    // Primitive defaults
    return value === null || value === undefined ? defaults : (value as T);
  }

  async toggleMaintenanceMode(enabled: boolean) {
    const current = await this.getSystemSettings();
    const updated = {
      ...current,
      maintenance: {
        ...current.maintenance,
        enabled,
        message: enabled
          ? "TaskZen is currently under maintenance. We'll be back shortly!"
          : "Maintenance mode disabled",
      },
    };
    await this.prisma.systemSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        data: updated as unknown as Prisma.InputJsonValue,
      },
      update: { data: updated as unknown as Prisma.InputJsonValue },
    });
    // Immediately refresh in-memory cache to avoid stale reads
    this.systemSettings.setCache(updated);
    return {
      success: true,
      status: {
        enabled,
        enabledAt: enabled ? new Date().toISOString() : null,
        message: updated.maintenance.message,
      },
    };
  }

  async getTransactions(
    userRole: UserRole,
    opts: {
      limit: number;
      offset?: number;
      status?: string;
      plan?: string;
      q?: string;
    },
  ) {
    this.checkAdminRole(userRole);
    const { limit, offset = 0, status, plan, q } = opts;

    // Map UI status string to Prisma enum
    let statusFilter: TransactionStatus | undefined;
    if (status && status !== "all") {
      const map: Record<string, TransactionStatus> = {
        succeeded: TransactionStatus.SUCCEEDED,
        pending: TransactionStatus.PENDING,
        refunded: TransactionStatus.REFUNDED,
        failed: TransactionStatus.FAILED,
      };
      statusFilter = map[status.toLowerCase() as keyof typeof map];
    }

    const where: Prisma.TransactionWhereInput = {};
    if (plan && plan !== "all") where.plan = plan;
    if (statusFilter) where.status = statusFilter;
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { id: { contains: term, mode: "insensitive" } },
        { user: { is: { email: { contains: term, mode: "insensitive" } } } },
        { user: { is: { username: { contains: term, mode: "insensitive" } } } },
      ];
    }

    // Request-level cache + in-flight dedupe to reduce DB pressure under bursty traffic
    const cacheKey = `tx:${JSON.stringify({ limit, offset, status: statusFilter ?? null, plan: plan ?? null, q: (q || "").trim().toLowerCase() })}`;
    const now = Date.now();
    const cached = this.txCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const existing = this.txInflight.get(cacheKey);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      const [total, records] = await this.prisma.$transaction([
        this.prisma.transaction.count({ where }),
        this.prisma.transaction.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, email: true, username: true } },
          },
        }),
      ]);

      const result = {
        total,
        transactions: records.map((t) => ({
          id: t.id,
          userId: t.userId,
          email: t.user?.email ?? "",
          username: t.user?.username ?? "",
          plan: t.plan,
          amount: Number(String(t.amount ?? "0")),
          currency: t.currency,
          status: String(t.status).toLowerCase(),
          createdAt: t.createdAt.toISOString(),
        })),
      };

      this.txCache.set(cacheKey, {
        value: result,
        expiresAt: Date.now() + this.smallCacheTtlMs,
      });
      return result;
    })();

    this.txInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      this.txInflight.delete(cacheKey);
    }
  }

  async exportRevenueTransactionsCsv(
    userRole: UserRole,
    opts: { status?: string; plan?: string; q?: string },
  ) {
    this.checkAdminRole(userRole);
    const { status, plan, q } = opts || {};

    // Map UI status string to Prisma enum
    let statusFilter: TransactionStatus | undefined;
    if (status && status !== "all") {
      const map: Record<string, TransactionStatus> = {
        succeeded: TransactionStatus.SUCCEEDED,
        pending: TransactionStatus.PENDING,
        refunded: TransactionStatus.REFUNDED,
        failed: TransactionStatus.FAILED,
      };
      statusFilter = map[status.toLowerCase() as keyof typeof map];
    }

    const where: Prisma.TransactionWhereInput = {};
    if (plan && plan !== "all") where.plan = plan;
    if (statusFilter) where.status = statusFilter;
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { id: { contains: term, mode: "insensitive" } },
        { user: { is: { email: { contains: term, mode: "insensitive" } } } },
        { user: { is: { username: { contains: term, mode: "insensitive" } } } },
      ];
    }

    const records = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, email: true, username: true } },
      },
    });

    const header = [
      "id",
      "userId",
      "email",
      "username",
      "plan",
      "amount",
      "currency",
      "status",
      "createdAt",
    ];
    const rows = records.map((t) => [
      t.id,
      t.userId,
      t.user?.email ?? "",
      t.user?.username ?? "",
      t.plan,
      Number(String(t.amount ?? "0")).toFixed(2),
      t.currency,
      String(t.status).toLowerCase(),
      t.createdAt.toISOString(),
    ]);

    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    return csv;
  }

  async getSystemHealth(userRole: UserRole) {
    this.checkAdminRole(userRole);

    const uptimeSec = process.uptime();
    const mem = process.memoryUsage();
    const memoryMB = Math.round(mem.rss / 1024 / 1024);

    let dbOk = false;
    let dbLatencyMs = 0;
    // Determine whether to perform a DB ping. Default behavior:
    // - development: ping DB
    // - production: skip DB ping to avoid consuming limited connections
    const env = process.env.NODE_ENV || "development";
    const flag = process.env.ADMIN_HEALTH_DB_PING?.trim();
    const shouldPingDb = flag ? flag === "true" : env !== "production";

    if (shouldPingDb) {
      try {
        const t0 = Date.now();
        // Simple DB ping
        await this.prisma.$queryRaw`SELECT 1`;
        dbLatencyMs = Date.now() - t0;
        dbOk = true;
      } catch (e) {
        dbOk = false;
      }
    } else {
      // Skip DB ping to reduce load on constrained environments (e.g., Neon + PgBouncer with low pool size)
      dbOk = true; // assume healthy when skipping ping
      dbLatencyMs = 0;
    }

    return {
      uptimeSec,
      memoryMB,
      dbOk,
      dbLatencyMs,
      node: process.version,
      env: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    };
  }

  async getRecentActivities(userRole: UserRole, limit: number = 10) {
    this.checkAdminRole(userRole);
    const key = `activities:${limit}`;
    const now = Date.now();
    const cached = this.activitiesCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const inflight = this.activitiesInflight.get(key);
    if (inflight) return inflight;

    const p = (async () => {
      const rows = await this.prisma.activity.findMany({
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, username: true, email: true, avatar: true },
          },
          board: {
            select: { id: true, title: true },
          },
        },
      });
      this.activitiesCache.set(key, {
        value: rows,
        expiresAt: Date.now() + this.smallCacheTtlMs,
      });
      return rows;
    })();

    this.activitiesInflight.set(key, p);
    try {
      return await p;
    } finally {
      this.activitiesInflight.delete(key);
    }
  }

  // Administrative dashboard overview
  async getDashboardStats(userRole: UserRole) {
    this.checkAdminRole(userRole);
    const [
      totalUsers,
      activeUsers,
      proUsers,
      totalBoards,
      archivedBoards,
      totalTasks,
      completedTasks,
      overdueTasks,
      recentUsers,
      recentBoards,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isPro: true } }),
      this.prisma.board.count(),
      this.prisma.board.count({ where: { isArchived: true } }),
      this.prisma.card.count(),
      this.prisma.card.count({ where: { isCompleted: true } }),
      this.prisma.card.count({
        where: { dueDate: { lt: new Date() }, isCompleted: false },
      }),
      this.prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          email: true,
          username: true,
          createdAt: true,
          isActive: true,
          isPro: true,
        },
      }),
      this.prisma.board.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, createdAt: true, isArchived: true },
      }),
    ]);

    const settings: SystemSettingsShape =
      await this.systemSettings.getSettings();
    const monthlyPrice = Number(settings.payments?.monthlyPrice ?? 9.99);
    const mrr = Number((proUsers * monthlyPrice).toFixed(2));
    const arr = Number((mrr * 12).toFixed(2));
    return {
      users: { total: totalUsers, active: activeUsers, pro: proUsers },
      boards: { total: totalBoards, archived: archivedBoards },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        overdue: overdueTasks,
      },
      revenue: { mrr, arr },
      recent: { users: recentUsers, boards: recentBoards },
    };
  }

  async getAllUsers(userRole: UserRole) {
    this.checkAdminRole(userRole);
    return this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        isPro: true,
        proExpiresAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { boards: true, cards: true } },
      },
    });
  }

  async getAllBoards(userRole: UserRole) {
    this.checkAdminRole(userRole);
    return this.prisma.board.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { id: true, email: true, username: true } },
        _count: { select: { lists: true, members: true, labels: true } },
      },
    });
  }

  async deactivateUser(userId: string, userRole: UserRole) {
    this.checkAdminRole(userRole);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: { id: true, email: true, username: true, isActive: true },
    });
    return { success: true, user };
  }

  async activateUser(userId: string, userRole: UserRole) {
    this.checkAdminRole(userRole);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
      select: { id: true, email: true, username: true, isActive: true },
    });
    return { success: true, user };
  }

  async upgradeUserToPro(userId: string, userRole: UserRole) {
    this.checkAdminRole(userRole);
    const now = new Date();
    const expires = new Date(now);
    expires.setMonth(now.getMonth() + 1);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isPro: true, proExpiresAt: expires },
      select: {
        id: true,
        email: true,
        username: true,
        isPro: true,
        proExpiresAt: true,
      },
    });
    return { success: true, user };
  }

  async makeUserAdmin(userId: string, userRole: UserRole) {
    this.checkAdminRole(userRole);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: UserRole.ADMIN },
      select: { id: true, email: true, username: true, role: true },
    });
    return { success: true, user };
  }

  async removeAdminRole(userId: string, userRole: UserRole) {
    this.checkAdminRole(userRole);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: UserRole.USER },
      select: { id: true, email: true, username: true, role: true },
    });
    return { success: true, user };
  }

  async updateUserSubscription(
    userId: string,
    userRole: UserRole,
    payload: {
      type: "FREE" | "PRO" | "ENTERPRISE";
      billingCycle?: "MONTHLY" | "YEARLY";
      status?: "ACTIVE" | "CANCELLED" | "EXPIRED";
    },
  ) {
    this.checkAdminRole(userRole);
    const now = new Date();
    let isPro = false;
    let proExpiresAt: Date | null = null;
    if (payload.type === "PRO" || payload.type === "ENTERPRISE") {
      isPro = payload.status !== "CANCELLED" && payload.status !== "EXPIRED";
      const months = payload.billingCycle === "YEARLY" ? 12 : 1;
      const exp = new Date(now);
      exp.setMonth(now.getMonth() + months);
      proExpiresAt = isPro ? exp : now;
    }
    if (payload.type === "FREE") {
      isPro = false;
      proExpiresAt = null;
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isPro, proExpiresAt },
      select: {
        id: true,
        email: true,
        username: true,
        isPro: true,
        proExpiresAt: true,
      },
    });
    return { success: true, user };
  }

  // Note: Performs a privacy-preserving soft delete due to relational constraints
  async deleteUser(userId: string, userRole: UserRole) {
    this.checkAdminRole(userRole);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException("User not found");
    }
    const suffix = userId.slice(0, 8);
    const anonymizedEmail = `deleted_${suffix}@example.invalid`;
    const anonymizedUsername = `deleted_${suffix}`;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: anonymizedEmail,
        username: anonymizedUsername,
        isActive: false,
        isPro: false,
        proExpiresAt: null,
      },
      select: { id: true, email: true, username: true, isActive: true },
    });
    return { success: true, softDeleted: true, user: updated };
  }

  async deleteBoard(boardId: string, userRole: UserRole) {
    this.checkAdminRole(userRole);
    await this.prisma.$transaction(async (tx) => {
      await tx.analyticsEvent.deleteMany({ where: { boardId } });
      await tx.activity.deleteMany({ where: { boardId } });
      await tx.board.delete({ where: { id: boardId } });
    });
    return { success: true, id: boardId };
  }
}
