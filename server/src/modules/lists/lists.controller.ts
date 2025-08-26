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
} from "@nestjs/common";
import { ListsService } from "./lists.service";
import { CreateListDto, UpdateListDto } from "./dto/list.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("lists")
@UseGuards(JwtAuthGuard)
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Post()
  create(@Body() createListDto: CreateListDto, @Request() req) {
    return this.listsService.create(createListDto, req.user.id, req.user.role);
  }

  @Get()
  findAll(@Query("boardId") boardId: string, @Request() req) {
    return this.listsService.findAll(boardId, req.user.id);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Request() req) {
    return this.listsService.findOne(id, req.user.id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() updateListDto: UpdateListDto,
    @Request() req,
  ) {
    return this.listsService.update(
      id,
      updateListDto,
      req.user.id,
      req.user.role,
    );
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Request() req) {
    return this.listsService.remove(id, req.user.id, req.user.role);
  }

  @Patch(":id/position")
  updatePosition(
    @Param("id") id: string,
    @Body() body: { position: number },
    @Request() req,
  ) {
    return this.listsService.updatePosition(
      id,
      body.position,
      req.user.id,
      req.user.role,
    );
  }
}
