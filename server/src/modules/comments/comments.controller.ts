import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator';

@Controller('comments')
@UseGuards(JwtAuthGuard)
@FeatureFlag('enableComments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  create(@Body() createCommentDto: any, @Request() req: any) {
    return this.commentsService.create({
      ...createCommentDto,
      authorId: req.user.id,
    });
  }

  @Get('card/:cardId')
  findByCard(@Param('cardId') cardId: string) {
    return this.commentsService.findByCard(cardId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCommentDto: any,
    @Request() req: any,
  ) {
    return this.commentsService.update(id, updateCommentDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.commentsService.remove(id, req.user.id);
  }
}
