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
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CardsService } from './cards.service';
import { CreateCardDto, UpdateCardDto, MoveCardDto, CreateCommentDto, CreateChecklistItemDto, UpdateChecklistItemDto } from './dto/card.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post()
  create(@Body() createCardDto: CreateCardDto, @Request() req) {
    return this.cardsService.create(createCardDto, req.user.id, req.user.role);
  }

  @Get()
  findAll(@Query('listId') listId: string, @Request() req) {
    return this.cardsService.findAll(listId, req.user.id);
  }

  @Get('calendar')
  getCalendarCards(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req: any,
    @Query('boardId') boardId?: string,
    @Query('priority') priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
    @Query('assigneeId') assigneeId?: string,
    @Query('labels') labels?: string, // comma-separated label IDs
    @Query('completed') completed?: string, // 'true' | 'false'
    @Query('sortBy') sortBy?: 'dueDate' | 'priority' | 'createdAt' | 'title',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.cardsService.getCalendarCards(
      new Date(startDate),
      new Date(endDate),
      req.user.id,
      boardId,
      {
        priority,
        assigneeId,
        labelIds: labels ? labels.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        completed: typeof completed === 'string' ? completed === 'true' : undefined,
        sortBy,
        sortOrder,
      },
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.cardsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCardDto: UpdateCardDto,
    @Request() req,
  ) {
    return this.cardsService.update(id, updateCardDto, req.user.id, req.user.role);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.cardsService.remove(id, req.user.id, req.user.role);
  }

  @Patch(':id/move')
  moveCard(
    @Param('id') id: string,
    @Body() moveCardDto: MoveCardDto,
    @Request() req,
  ) {
    return this.cardsService.moveCard(id, moveCardDto.listId, moveCardDto.position, req.user.id, req.user.role);
  }

  @Post(':id/comments')
  @FeatureFlag('enableComments')
  addComment(
    @Param('id') id: string,
    @Body() createCommentDto: CreateCommentDto,
    @Request() req,
  ) {
    return this.cardsService.addComment(id, createCommentDto.content, req.user.id, req.user.role);
  }

  @Post(':id/attachments')
  @FeatureFlag('enableFileUploads')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain',
          'application/zip',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      },
    }),
  )
  uploadAttachments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req,
  ) {
    return this.cardsService.uploadAttachments(id, files, req.user.id, req.user.role);
  }

  @Delete('attachments/:attachmentId')
  @FeatureFlag('enableFileUploads')
  deleteAttachment(
    @Param('attachmentId') attachmentId: string,
    @Request() req,
  ) {
    return this.cardsService.deleteAttachment(attachmentId, req.user.id, req.user.role);
  }

  @Post(':id/labels')
  addLabel(
    @Param('id') id: string,
    @Body() body: { labelId: string },
    @Request() req,
  ) {
    return this.cardsService.addLabel(id, body.labelId, req.user.id, req.user.role);
  }

  @Delete(':id/labels/:labelId')
  removeLabel(
    @Param('id') id: string,
    @Param('labelId') labelId: string,
    @Request() req,
  ) {
    return this.cardsService.removeLabel(id, labelId, req.user.id, req.user.role);
  }

  // Checklist
  @Get(':id/checklist')
  getChecklist(@Param('id') id: string, @Request() req) {
    return this.cardsService.listChecklistItems(id, req.user.id);
  }

  @Post(':id/checklist')
  addChecklistItem(
    @Param('id') id: string,
    @Body() dto: CreateChecklistItemDto,
    @Request() req,
  ) {
    return this.cardsService.addChecklistItem(id, dto.text, req.user.id, req.user.role);
  }

  @Patch('checklist/:itemId')
  updateChecklistItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @Request() req,
  ) {
    return this.cardsService.updateChecklistItem(itemId, dto, req.user.id, req.user.role);
  }

  @Delete('checklist/:itemId')
  deleteChecklistItem(
    @Param('itemId') itemId: string,
    @Request() req,
  ) {
    return this.cardsService.deleteChecklistItem(itemId, req.user.id, req.user.role);
  }
}
