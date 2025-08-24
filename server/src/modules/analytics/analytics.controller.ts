import { Body, Controller, Post, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsEventsService } from './analytics-events.service';
import { StartSessionDto } from './dto/start-session.dto';
import { EndSessionDto } from './dto/end-session.dto';
import { CreateAnalyticsEventDto } from './dto/create-analytics-event.dto';
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
@FeatureFlag('enableAnalytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsEventsService) {}

  @Post('session/start')
  startSession(@Body() dto: StartSessionDto, @Req() req: any) {
    return this.analyticsService.startSession(req.user.id, dto, req);
  }

  @Post('session/end')
  endSession(@Body() dto: EndSessionDto, @Req() req: any) {
    return this.analyticsService.endSession(req.user.id, dto);
  }

  @Post('event')
  recordEvent(@Body() dto: CreateAnalyticsEventDto, @Req() req: any) {
    return this.analyticsService.recordEvent(req.user.id, dto, req);
  }
}
