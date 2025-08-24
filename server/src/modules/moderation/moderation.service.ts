import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { 
  ContentType, 
  ReportReason, 
  ReportStatus, 
  ReportPriority,
  ViolationType,
  ViolationSeverity,
  ModActionType,
  Prisma
} from '@prisma/client';
import { CreateReportDto, UpdateReportDto, CreateViolationDto, CreateModerationActionDto, BulkActionDto } from './dto';

@Injectable()
export class ModerationService {
  constructor(private prisma: PrismaService) {}

  // Content Reports
  async createReport(dto: CreateReportDto, reporterId: string) {
    // Validate content exists
    await this.validateContent(dto.contentType, dto.contentId);

    // Get reported user based on content type
    const reportedUserId = await this.getContentOwnerId(dto.contentType, dto.contentId);

    return this.prisma.contentReport.create({
      data: {
        contentType: dto.contentType,
        contentId: dto.contentId,
        reason: dto.reason,
        description: dto.description,
        priority: dto.priority || ReportPriority.MEDIUM,
        reporterId,
        reportedUserId,
      },
      include: {
        reporter: {
          select: { id: true, username: true, email: true }
        },
        reportedUser: {
          select: { id: true, username: true, email: true }
        }
      }
    });
  }

  async getReports(params: {
    status?: ReportStatus;
    contentType?: ContentType;
    priority?: ReportPriority;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { 
      status, 
      contentType, 
      priority, 
      page = 1, 
      limit = 20, 
      sortBy = 'createdAt',
      sortOrder = 'desc' 
    } = params;

    const where: Prisma.ContentReportWhereInput = {};
    
    if (status) where.status = status;
    if (contentType) where.contentType = contentType;
    if (priority) where.priority = priority;

    const [reports, total] = await Promise.all([
      this.prisma.contentReport.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          reporter: {
            select: { id: true, username: true, email: true, avatar: true }
          },
          reportedUser: {
            select: { id: true, username: true, email: true, avatar: true }
          },
          reviewedBy: {
            select: { id: true, username: true }
          },
          violations: {
            include: {
              user: {
                select: { id: true, username: true, email: true }
              }
            }
          },
          moderationActions: {
            include: {
              moderator: {
                select: { id: true, username: true }
              }
            }
          }
        }
      }),
      this.prisma.contentReport.count({ where })
    ]);

    // Fetch actual content details
    const reportsWithContent = await Promise.all(
      reports.map(async (report) => {
        const content = await this.getContentDetails(report.contentType, report.contentId);
        return { ...report, content };
      })
    );

    return {
      data: reportsWithContent,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getReport(id: string) {
    const report = await this.prisma.contentReport.findUnique({
      where: { id },
      include: {
        reporter: {
          select: { id: true, username: true, email: true, avatar: true }
        },
        reportedUser: {
          select: { id: true, username: true, email: true, avatar: true }
        },
        reviewedBy: {
          select: { id: true, username: true }
        },
        violations: {
          include: {
            user: {
              select: { id: true, username: true, email: true }
            }
          }
        },
        moderationActions: {
          include: {
            moderator: {
              select: { id: true, username: true }
            },
            targetUser: {
              select: { id: true, username: true, email: true }
            }
          }
        }
      }
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const content = await this.getContentDetails(report.contentType, report.contentId);
    return { ...report, content };
  }

  async updateReport(id: string, dto: UpdateReportDto, reviewerId: string) {
    const report = await this.prisma.contentReport.findUnique({
      where: { id }
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const updateData: Prisma.ContentReportUpdateInput = {
      ...dto,
      reviewedBy: { connect: { id: reviewerId } },
      reviewedAt: new Date()
    };

    if (dto.status === ReportStatus.RESOLVED) {
      updateData.resolvedAt = new Date();
    }

    return this.prisma.contentReport.update({
      where: { id },
      data: updateData,
      include: {
        reporter: {
          select: { id: true, username: true, email: true }
        },
        reportedUser: {
          select: { id: true, username: true, email: true }
        },
        reviewedBy: {
          select: { id: true, username: true }
        }
      }
    });
  }

  // Violations
  async createViolation(dto: CreateViolationDto, moderatorId: string, reportId?: string) {
    const violation = await this.prisma.violation.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        severity: dto.severity,
        description: dto.description,
        evidence: dto.evidence,
        reportId,
        expiresAt: dto.expiresAt
      },
      include: {
        user: {
          select: { id: true, username: true, email: true }
        },
        report: true
      }
    });

    // Auto-create moderation action based on severity
    if (dto.autoAction) {
      const action = this.determineAutoAction(dto.severity);
      if (action) {
        await this.createModerationAction({
          targetUserId: dto.userId,
          action,
          reason: `Auto-action for ${dto.severity} violation: ${dto.description}`,
          reportId: reportId,
          violationId: violation.id,
          duration: action === ModActionType.TEMPORARY_SUSPENSION ? 24 * 7 : undefined // 7 days default
        }, moderatorId);
      }
    }

    return violation;
  }

  async getViolations(params: {
    userId?: string;
    type?: ViolationType;
    severity?: ViolationSeverity;
    page?: number;
    limit?: number;
  }) {
    const { userId, type, severity, page = 1, limit = 20 } = params;

    const where: Prisma.ViolationWhereInput = {};
    
    if (userId) where.userId = userId;
    if (type) where.type = type;
    if (severity) where.severity = severity;

    const [violations, total] = await Promise.all([
      this.prisma.violation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, username: true, email: true, avatar: true }
          },
          report: true,
          actions: {
            include: {
              moderator: {
                select: { id: true, username: true }
              }
            }
          }
        }
      }),
      this.prisma.violation.count({ where })
    ]);

    return {
      data: violations,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Moderation Actions
  async createModerationAction(dto: CreateModerationActionDto, moderatorId: string) {
    const expiresAt = dto.duration 
      ? new Date(Date.now() + dto.duration * 60 * 60 * 1000)
      : undefined;

    const action = await this.prisma.moderationAction.create({
      data: {
        targetUserId: dto.targetUserId,
        moderatorId,
        action: dto.action,
        reason: dto.reason,
        duration: dto.duration,
        metadata: dto.metadata,
        reportId: dto.reportId,
        violationId: dto.violationId,
        expiresAt
      },
      include: {
        targetUser: {
          select: { id: true, username: true, email: true }
        },
        moderator: {
          select: { id: true, username: true }
        }
      }
    });

    // Apply the action
    await this.applyModerationAction(action);

    return action;
  }

  async getModerationActions(params: {
    targetUserId?: string;
    moderatorId?: string;
    action?: ModActionType;
    page?: number;
    limit?: number;
  }) {
    const { targetUserId, moderatorId, action, page = 1, limit = 20 } = params;

    const where: Prisma.ModerationActionWhereInput = {};
    
    if (targetUserId) where.targetUserId = targetUserId;
    if (moderatorId) where.moderatorId = moderatorId;
    if (action) where.action = action;

    const [actions, total] = await Promise.all([
      this.prisma.moderationAction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          targetUser: {
            select: { id: true, username: true, email: true, avatar: true }
          },
          moderator: {
            select: { id: true, username: true, avatar: true }
          },
          report: true,
          violation: true
        }
      }),
      this.prisma.moderationAction.count({ where })
    ]);

    return {
      data: actions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Bulk Actions
  async performBulkAction(dto: BulkActionDto, moderatorId: string) {
    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[]
    };

    for (const reportId of dto.reportIds) {
      try {
        switch (dto.action) {
          case 'resolve':
            await this.updateReport(reportId, { 
              status: ReportStatus.RESOLVED 
            }, moderatorId);
            break;
          
          case 'dismiss':
            await this.updateReport(reportId, { 
              status: ReportStatus.DISMISSED 
            }, moderatorId);
            break;
          
          case 'escalate':
            await this.updateReport(reportId, { 
              status: ReportStatus.ESCALATED,
              priority: ReportPriority.HIGH
            }, moderatorId);
            break;
          
          case 'delete_content':
            const report = await this.getReport(reportId);
            await this.deleteContent(report.contentType, report.contentId);
            await this.updateReport(reportId, { 
              status: ReportStatus.RESOLVED 
            }, moderatorId);
            break;
          
          case 'ban_user':
            const reportForBan = await this.getReport(reportId);
            if (reportForBan.reportedUserId) {
              await this.createModerationAction({
                targetUserId: reportForBan.reportedUserId,
                action: ModActionType.PERMANENT_BAN,
                reason: dto.reason || 'Bulk action: User ban',
                reportId
              }, moderatorId);
            }
            break;
        }
        
        results.success.push(reportId);
      } catch (error) {
        results.failed.push({
          id: reportId,
          error: error.message || 'Unknown error'
        });
      }
    }

    return results;
  }

  // Statistics
  async getModerationStats() {
    const [
      totalReports,
      pendingReports,
      resolvedReports,
      totalViolations,
      totalActions,
      recentReports,
      topReporters,
      topViolators
    ] = await Promise.all([
      this.prisma.contentReport.count(),
      this.prisma.contentReport.count({ where: { status: ReportStatus.PENDING } }),
      this.prisma.contentReport.count({ where: { status: ReportStatus.RESOLVED } }),
      this.prisma.violation.count(),
      this.prisma.moderationAction.count(),
      this.prisma.contentReport.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { username: true } },
          reportedUser: { select: { username: true } }
        }
      }),
      this.prisma.contentReport.groupBy({
        by: ['reporterId'],
        _count: true,
        orderBy: { _count: { reporterId: 'desc' } },
        take: 5
      }),
      this.prisma.violation.groupBy({
        by: ['userId'],
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: 5
      })
    ]);

    // Get user details for top reporters and violators
    const topReporterIds = topReporters.map(r => r.reporterId);
    const topViolatorIds = topViolators.map(v => v.userId);
    
    const [reporterDetails, violatorDetails] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: topReporterIds } },
        select: { id: true, username: true, email: true }
      }),
      this.prisma.user.findMany({
        where: { id: { in: topViolatorIds } },
        select: { id: true, username: true, email: true }
      })
    ]);

    return {
      overview: {
        totalReports,
        pendingReports,
        resolvedReports,
        resolutionRate: totalReports > 0 ? (resolvedReports / totalReports) * 100 : 0,
        totalViolations,
        totalActions
      },
      recentReports,
      topReporters: topReporters.map(r => ({
        user: reporterDetails.find(u => u.id === r.reporterId),
        count: r._count
      })),
      topViolators: topViolators.map(v => ({
        user: violatorDetails.find(u => u.id === v.userId),
        count: v._count
      }))
    };
  }

  // Helper methods
  private async validateContent(type: ContentType, id: string) {
    let exists = false;
    
    switch (type) {
      case ContentType.BOARD:
        exists = !!(await this.prisma.board.findUnique({ where: { id } }));
        break;
      case ContentType.CARD:
        exists = !!(await this.prisma.card.findUnique({ where: { id } }));
        break;
      case ContentType.COMMENT:
        exists = !!(await this.prisma.comment.findUnique({ where: { id } }));
        break;
      case ContentType.USER_PROFILE:
        exists = !!(await this.prisma.user.findUnique({ where: { id } }));
        break;
    }

    if (!exists) {
      throw new NotFoundException(`Content of type ${type} with ID ${id} not found`);
    }
  }

  private async getContentOwnerId(type: ContentType, id: string): Promise<string | null> {
    switch (type) {
      case ContentType.BOARD:
        const board = await this.prisma.board.findUnique({ 
          where: { id },
          select: { ownerId: true }
        });
        return board?.ownerId || null;
      
      case ContentType.CARD:
        const card = await this.prisma.card.findUnique({ 
          where: { id },
          select: { assigneeId: true }
        });
        return card?.assigneeId || null;
      
      case ContentType.COMMENT:
        const comment = await this.prisma.comment.findUnique({ 
          where: { id },
          select: { authorId: true }
        });
        return comment?.authorId || null;
      
      case ContentType.USER_PROFILE:
        return id;
      
      default:
        return null;
    }
  }

  private async getContentDetails(type: ContentType, id: string) {
    switch (type) {
      case ContentType.BOARD:
        const board = await this.prisma.board.findUnique({ 
          where: { id },
          select: { 
            id: true, 
            title: true, 
            description: true,
            owner: {
              select: { id: true, username: true, email: true }
            }
          }
        });
        return board;
      
      case ContentType.CARD:
        const card = await this.prisma.card.findUnique({ 
          where: { id },
          select: { 
            id: true, 
            title: true, 
            description: true,
            assignee: {
              select: { id: true, username: true, email: true }
            }
          }
        });
        return card;
      
      case ContentType.COMMENT:
        const comment = await this.prisma.comment.findUnique({ 
          where: { id },
          select: { 
            id: true, 
            content: true,
            author: {
              select: { id: true, username: true, email: true }
            }
          }
        });
        return comment;
      
      case ContentType.USER_PROFILE:
        const user = await this.prisma.user.findUnique({ 
          where: { id },
          select: { 
            id: true, 
            username: true, 
            email: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        });
        return user;
      
      default:
        return null;
    }
  }

  private async deleteContent(type: ContentType, id: string) {
    switch (type) {
      case ContentType.BOARD:
        await this.prisma.board.delete({ where: { id } });
        break;
      case ContentType.CARD:
        await this.prisma.card.delete({ where: { id } });
        break;
      case ContentType.COMMENT:
        await this.prisma.comment.delete({ where: { id } });
        break;
      default:
        throw new BadRequestException(`Cannot delete content of type ${type}`);
    }
  }

  private async applyModerationAction(action: any) {
    switch (action.action) {
      case ModActionType.PERMANENT_BAN:
      case ModActionType.TEMPORARY_SUSPENSION:
        await this.prisma.user.update({
          where: { id: action.targetUserId },
          data: { isActive: false }
        });
        break;
      
      case ModActionType.CONTENT_REMOVAL:
        // Content removal is handled separately
        break;
      
      // Add more action implementations as needed
    }
  }

  private determineAutoAction(severity: ViolationSeverity): ModActionType | null {
    switch (severity) {
      case ViolationSeverity.SEVERE:
        return ModActionType.PERMANENT_BAN;
      case ViolationSeverity.MAJOR:
        return ModActionType.TEMPORARY_SUSPENSION;
      case ViolationSeverity.MODERATE:
        return ModActionType.WARNING;
      default:
        return null;
    }
  }
}
