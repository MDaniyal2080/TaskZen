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

type TxAgg = { _sum: { amount: number | null } };

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

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

  private async calculateMonthlyRevenueSeries(
    months: number,
    now: Date = new Date(),
  ) {
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
        .catch(() => ({ _sum: { amount: 0 } }) as TxAgg);

      const amount = Number(agg._sum.amount ?? 0);
      const label = monthStart.toLocaleString("default", {
        month: "short",
        year: "numeric",
      });
      series.push({ month: label, amount });
    }
    return series;
  }

  async getAnalytics(userRole: UserRole, timeRange?: string) {
    this.checkAdminRole(userRole);
    // Parse time range
    const parseDays = (tr?: string) => {
      if (!tr) return 30;
      const m = /^([0-9]+)d$/i.exec(tr.trim());
      if (m) return Math.max(1, Number(m[1]));
      return 30;
    };
    const days = parseDays(timeRange);
    const now = new Date();
    const startCurr = new Date(now);
    startCurr.setDate(now.getDate() - days);
    const startPrev = new Date(now);
    startPrev.setDate(now.getDate() - days * 2);
    const endPrev = startCurr;
    const growthPct = (curr: number, prev: number) =>
      prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;

    // Overview (sequential to avoid pool pressure)
    const totalUsers = await this.prisma.user.count();
    const activeUsers = await this.prisma.user.count({
      where: { isActive: true },
    });
    const proUsersCount = await this.prisma.user.count({
      where: { isPro: true },
    });
    const totalBoards = await this.prisma.board.count();
    const totalTasks = await this.prisma.card.count();
    const completedTasks = await this.prisma.card.count({
      where: { isCompleted: true },
    });

    const completionRate =
      totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const avgTasksPerUser = totalUsers > 0 ? totalTasks / totalUsers : 0;

    // Settings & revenue
    const settings: SystemSettingsShape =
      await this.systemSettings.getSettings();
    const monthlyPrice = Number(settings.payments?.monthlyPrice ?? 9.99);
    const mrr = Number((proUsersCount * monthlyPrice).toFixed(2));
    const arr = Number((mrr * 12).toFixed(2));

    const proUsers = await this.prisma.user.findMany({
      where: { isPro: true },
      select: { id: true, createdAt: true, proExpiresAt: true },
    });
    const churnRate = (() => {
      const nowD = new Date();
      const expired = proUsers.filter(
        (u) => u.proExpiresAt && new Date(u.proExpiresAt) < nowD,
      ).length;
      return proUsers.length > 0
        ? Number(((expired / proUsers.length) * 100).toFixed(2))
        : 0;
    })();

    // Growth metrics (users/boards/tasks)
    const usersPrev = await this.prisma.user.count({
      where: { createdAt: { gte: startPrev, lt: endPrev } },
    });
    const usersCurr = await this.prisma.user.count({
      where: { createdAt: { gte: startCurr, lte: now } },
    });
    const boardsPrev = await this.prisma.board.count({
      where: { createdAt: { gte: startPrev, lt: endPrev } },
    });
    const boardsCurr = await this.prisma.board.count({
      where: { createdAt: { gte: startCurr, lte: now } },
    });
    const tasksPrev = await this.prisma.card.count({
      where: { createdAt: { gte: startPrev, lt: endPrev } },
    });
    const tasksCurr = await this.prisma.card.count({
      where: { createdAt: { gte: startCurr, lte: now } },
    });

    // Revenue growth via transactions
    const revPrevAgg = await this.prisma.transaction.aggregate({
      where: {
        status: TransactionStatus.SUCCEEDED,
        createdAt: { gte: startPrev, lt: endPrev },
      },
      _sum: { amount: true },
    });
    const revCurrAgg = await this.prisma.transaction.aggregate({
      where: {
        status: TransactionStatus.SUCCEEDED,
        createdAt: { gte: startCurr, lte: now },
      },
      _sum: { amount: true },
    });
    const revPrev = Number(revPrevAgg._sum.amount ?? 0);
    const revCurr = Number(revCurrAgg._sum.amount ?? 0);

    // Task metrics
    const overdue = await this.prisma.card.count({
      where: { dueDate: { lt: new Date() }, isCompleted: false },
    });

    // Board metrics
    const boards = await this.prisma.board.findMany({
      include: { _count: { select: { lists: true, members: true } } },
    });
    const avgListsPerBoard = boards.length
      ? boards.reduce((acc, b) => acc + b._count.lists, 0) / boards.length
      : 0;
    const avgCardsPerBoard = await (async () => {
      // Fallback approximation using lists count if cards count by board is not easily accessible
      // Keep simple: average 0 for now to avoid complex joins
      return 0;
    })();
    const mostActiveBoards = boards
      .map((b) => ({
        id: b.id,
        title: b.title,
        activity: b._count.lists + b._count.members,
      }))
      .sort((a, b) => b.activity - a.activity)
      .slice(0, 5);

    return {
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
        byPlan: [
          {
            plan: "Pro",
            amount: Number((proUsersCount * monthlyPrice).toFixed(2)),
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
        overview: {
          completionRate,
          overdue,
        },
        byStatus: [
          { status: "completed", count: completedTasks },
          {
            status: "pending",
            count: Math.max(totalTasks - completedTasks, 0),
          },
        ],
        byPriority: [],
      },
      boardMetrics: {
        avgListsPerBoard: Number(avgListsPerBoard.toFixed(2)),
        avgCardsPerBoard: Number(avgCardsPerBoard.toFixed(2)),
        mostActiveBoards,
      },
    };
  }

  async exportAnalytics(userRole: UserRole, format: "csv" | "pdf") {
    this.checkAdminRole(userRole);

    const analytics = await this.getAnalytics(userRole);
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
    await this.systemSettings.getSettings(true);
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

    // Run sequentially to avoid parallel queries in constrained environments
    const total = await this.prisma.transaction.count({ where });
    const records = await this.prisma.transaction.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, email: true, username: true } },
      },
    });

    return {
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
    return this.prisma.activity.findMany({
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
  }

  // Administrative dashboard overview
  async getDashboardStats(userRole: UserRole) {
    this.checkAdminRole(userRole);
    const totalUsers = await this.prisma.user.count();
    const activeUsers = await this.prisma.user.count({
      where: { isActive: true },
    });
    const proUsers = await this.prisma.user.count({ where: { isPro: true } });
    const totalBoards = await this.prisma.board.count();
    const archivedBoards = await this.prisma.board.count({
      where: { isArchived: true },
    });
    const totalTasks = await this.prisma.card.count();
    const completedTasks = await this.prisma.card.count({
      where: { isCompleted: true },
    });
    const overdueTasks = await this.prisma.card.count({
      where: { dueDate: { lt: new Date() }, isCompleted: false },
    });
    const settings: SystemSettingsShape =
      await this.systemSettings.getSettings();
    const monthlyPrice = Number(settings.payments?.monthlyPrice ?? 9.99);
    const mrr = Number((proUsers * monthlyPrice).toFixed(2));
    const arr = Number((mrr * 12).toFixed(2));
    const recentUsers = await this.prisma.user.findMany({
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
    });
    const recentBoards = await this.prisma.board.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, createdAt: true, isArchived: true },
    });
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
