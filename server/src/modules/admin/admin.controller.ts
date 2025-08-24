import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  UseGuards,
  Request,
  Query,
  Res,
  Post,
  Body,
  Put,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { RevenueMetricsDto, RevenueTransactionsResponseDto } from './dto/revenue.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get('dashboard')
  getDashboardStats(@Request() req) {
    return this.adminService.getDashboardStats(req.user.role);
  }

  @Get('users')
  getAllUsers(@Request() req) {
    return this.adminService.getAllUsers(req.user.role);
  }

  @Get('boards')
  getAllBoards(@Request() req) {
    return this.adminService.getAllBoards(req.user.role);
  }

  @Patch('users/:id/deactivate')
  deactivateUser(@Param('id') id: string, @Request() req) {
    return this.adminService.deactivateUser(id, req.user.role);
  }

  @Patch('users/:id/activate')
  activateUser(@Param('id') id: string, @Request() req) {
    return this.adminService.activateUser(id, req.user.role);
  }

  @Patch('users/:id/upgrade')
  upgradeUserToPro(@Param('id') id: string, @Request() req) {
    return this.adminService.upgradeUserToPro(id, req.user.role);
  }

  @Patch('users/:id/make-admin')
  makeUserAdmin(@Param('id') id: string, @Request() req) {
    return this.adminService.makeUserAdmin(id, req.user.role);
  }

  @Patch('users/:id/remove-admin')
  removeAdminRole(@Param('id') id: string, @Request() req) {
    return this.adminService.removeAdminRole(id, req.user.role);
  }

  @Patch('users/:id/subscription')
  updateUserSubscription(
    @Param('id') id: string,
    @Body() payload: { type: 'FREE' | 'PRO' | 'ENTERPRISE'; billingCycle?: 'MONTHLY' | 'YEARLY'; status?: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' },
    @Request() req,
  ) {
    return this.adminService.updateUserSubscription(id, req.user.role, payload);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string, @Request() req) {
    return this.adminService.deleteUser(id, req.user.role);
  }

  @Delete('boards/:id')
  deleteBoard(@Param('id') id: string, @Request() req) {
    return this.adminService.deleteBoard(id, req.user.role);
  }

  @Get('analytics')
  async getAnalytics(@Request() req, @Query('timeRange') timeRange?: string) {
    return this.adminService.getAnalytics(req.user.role, timeRange);
  }

  @Get('analytics/export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async exportAnalytics(
    @Query('format') format: 'csv' | 'pdf' = 'csv',
    @Request() req,
    @Res() res: Response,
  ) {
    const data = await this.adminService.exportAnalytics(req.user.role, format);
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=taskzen-analytics-${Date.now()}.csv`);
      res.send(data);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=taskzen-analytics-${Date.now()}.pdf`);
      res.setHeader('Content-Length', (data as Buffer).length.toString());
      res.end(data);
    }
  }

  // Revenue Endpoints
  @Get('revenue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get revenue metrics (estimated from Pro users)' })
  @ApiOkResponse({ type: RevenueMetricsDto })
  async getRevenue(@Request() _req) {
    // Uses AnalyticsService to compute revenue metrics estimated from Pro users
    return this.analyticsService.getRevenueMetrics();
  }

  @Get('revenue/transactions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get revenue transactions' })
  @ApiOkResponse({ type: RevenueTransactionsResponseDto })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of transactions to return' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset for pagination' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by transaction status' })
  @ApiQuery({ name: 'plan', required: false, type: String, description: 'Filter by plan type' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Search query for transactions' })
  async getRevenueTransactions(
    @Request() req,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
    @Query('plan') plan?: string,
    @Query('q') q?: string,
  ) {
    const lim = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const off = Math.max(Number(offset) || 0, 0);
    return this.adminService.getTransactions(req.user.role, {
      limit: lim,
      offset: off,
      status,
      plan,
      q,
    });
  }

  @Get('revenue/transactions/export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Export revenue transactions as CSV (honors filters)' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by transaction status' })
  @ApiQuery({ name: 'plan', required: false, type: String, description: 'Filter by plan type' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Search query for transactions' })
  async exportRevenueTransactionsCsv(
    @Request() req,
    @Query('status') status: string | undefined,
    @Query('plan') plan: string | undefined,
    @Query('q') q: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.adminService.exportRevenueTransactionsCsv(req.user.role, { status, plan, q });
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=taskzen-transactions-${date}.csv`);
    res.send(csv);
  }

  // System Health
  @Get('health')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getSystemHealth(@Request() req) {
    return this.adminService.getSystemHealth(req.user.role);
  }

  // Recent Activities
  @Get('activities')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getRecentActivities(
    @Request() req,
    @Query('limit') limit?: string,
  ) {
    const lim = Number(limit) || 10;
    return this.adminService.getRecentActivities(req.user.role, lim);
  }

  // Content Moderation Endpoints
  @Get('moderation/flagged')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getFlaggedContent(
    @Query('status') status?: string,
  ) {
    return this.adminService.getFlaggedContent(status);
  }

  @Get('moderation/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getModeratedUsers() {
    return this.adminService.getModeratedUsers();
  }

  @Post('moderation/review/:contentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async reviewContent(
    @Param('contentId') contentId: string,
    @Body() reviewData: { action: 'approve' | 'remove' | 'dismiss' },
    @Request() req,
  ) {
    return this.adminService.reviewContent(contentId, reviewData.action, req.user.id);
  }

  @Post('moderation/user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async moderateUser(
    @Param('userId') userId: string,
    @Body() actionData: { action: 'warn' | 'suspend' | 'ban' | 'activate' },
  ) {
    return this.adminService.moderateUser(userId, actionData.action);
  }

  // System Settings Endpoints
  @Get('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getSettings() {
    return this.adminService.getSystemSettings();
  }

  @Put('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async updateSettings(@Body() settings: any) {
    return this.adminService.updateSystemSettings(settings);
  }

  @Post('maintenance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async toggleMaintenance(@Body() data: { enabled: boolean }) {
    return this.adminService.toggleMaintenanceMode(data.enabled);
  }
}
