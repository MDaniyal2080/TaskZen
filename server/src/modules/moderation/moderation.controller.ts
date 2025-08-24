import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query, 
  UseGuards,
  Req,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import {
  CreateReportDto,
  UpdateReportDto,
  CreateViolationDto,
  CreateModerationActionDto,
  BulkActionDto,
  GetReportsQueryDto,
  GetViolationsQueryDto,
  GetModerationActionsQueryDto
} from './dto';

@Controller('moderation')
@UseGuards(JwtAuthGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  // Public endpoints (for users to report content)
  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  async createReport(@Body() dto: CreateReportDto, @Req() req: any) {
    return this.moderationService.createReport(dto, req.user.id);
  }

  // Admin-only endpoints
  @Get('reports')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getReports(@Query() query: GetReportsQueryDto) {
    return this.moderationService.getReports(query);
  }

  @Get('reports/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getReport(@Param('id') id: string) {
    return this.moderationService.getReport(id);
  }

  @Put('reports/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateReport(
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
    @Req() req: any
  ) {
    return this.moderationService.updateReport(id, dto, req.user.id);
  }

  @Post('reports/bulk-action')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async performBulkAction(@Body() dto: BulkActionDto, @Req() req: any) {
    return this.moderationService.performBulkAction(dto, req.user.id);
  }

  // Violations
  @Post('violations')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createViolation(@Body() dto: CreateViolationDto, @Req() req: any) {
    return this.moderationService.createViolation(dto, req.user.id);
  }

  @Get('violations')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getViolations(@Query() query: GetViolationsQueryDto) {
    return this.moderationService.getViolations(query);
  }

  // Moderation Actions
  @Post('actions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createModerationAction(
    @Body() dto: CreateModerationActionDto,
    @Req() req: any
  ) {
    return this.moderationService.createModerationAction(dto, req.user.id);
  }

  @Get('actions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getModerationActions(@Query() query: GetModerationActionsQueryDto) {
    return this.moderationService.getModerationActions(query);
  }

  // Statistics
  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getModerationStats() {
    return this.moderationService.getModerationStats();
  }
}
