import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from "@nestjs/common";
import { LabelsService } from "./labels.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("labels")
@UseGuards(JwtAuthGuard)
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post()
  create(
    @Body() createLabelDto: { name: string; color: string; boardId: string },
    @Request() req: any,
  ) {
    return this.labelsService.create(createLabelDto, req.user.id);
  }

  @Get("board/:boardId")
  findByBoard(@Param("boardId") boardId: string) {
    return this.labelsService.findByBoard(boardId);
  }

  @Get("card/:cardId")
  findByCard(@Param("cardId") cardId: string) {
    return this.labelsService.findByCard(cardId);
  }

  @Post("card/:cardId/label/:labelId")
  addToCard(
    @Param("cardId") cardId: string,
    @Param("labelId") labelId: string,
    @Request() req: any,
  ) {
    return this.labelsService.addToCard(cardId, labelId, req.user.id);
  }

  @Delete("card/:cardId/label/:labelId")
  removeFromCard(
    @Param("cardId") cardId: string,
    @Param("labelId") labelId: string,
    @Request() req: any,
  ) {
    return this.labelsService.removeFromCard(cardId, labelId, req.user.id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() updateLabelDto: { name?: string; color?: string },
    @Request() req: any,
  ) {
    return this.labelsService.update(id, updateLabelDto, req.user.id);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Request() req: any) {
    return this.labelsService.remove(id, req.user.id);
  }
}
