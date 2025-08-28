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
  Res,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { BoardsService } from "./boards.service";
import { CreateBoardDto } from "./dto/create-board.dto";
import { UpdateBoardDto } from "./dto/update-board.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Response } from "express";
import { BoardMemberRole } from "@prisma/client";
import {
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
  ApiTags,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBody,
} from "@nestjs/swagger";
import { UsersService } from "../users/users.service";

@Controller("boards")
@UseGuards(JwtAuthGuard)
@ApiTags("Boards")
@ApiBearerAuth()
export class BoardsController {
  constructor(
    private readonly boardsService: BoardsService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  create(@Body() createBoardDto: CreateBoardDto, @Request() req) {
    return this.boardsService.create(createBoardDto, req.user.id);
  }

  @Get()
  findAll(@Request() req) {
    return this.boardsService.findAll(req.user.id);
  }

  @Get("templates")
  listTemplates(@Request() req): Promise<any> {
    return this.boardsService.listTemplates(req.user.id);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Request() req) {
    return this.boardsService.findOne(id, req.user.id, req.user.role);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() updateBoardDto: UpdateBoardDto,
    @Request() req,
  ) {
    return this.boardsService.update(
      id,
      updateBoardDto,
      req.user.id,
      req.user.role,
    );
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Request() req) {
    return this.boardsService.remove(id, req.user.id, req.user.role);
  }

  @Post(":id/save-as-template")
  saveAsTemplate(@Param("id") id: string, @Request() req) {
    return this.boardsService.saveAsTemplate(id, req.user.id);
  }

  @Post(":id/members")
  @ApiOperation({
    summary: "Add a member to a board by userId or email",
    description:
      "Allows board owners or board admins to add a member. You can provide either a userId or an email. If email is provided, it will be resolved to a userId.",
  })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: "object",
          properties: {
            userId: { type: "string", example: "ckv123abc" },
            role: {
              type: "string",
              enum: ["OWNER", "ADMIN", "MEMBER", "VIEWER"],
              example: "MEMBER",
            },
          },
          required: ["userId"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            email: { type: "string", format: "email", example: "user@example.com" },
            role: {
              type: "string",
              enum: ["OWNER", "ADMIN", "MEMBER", "VIEWER"],
              example: "MEMBER",
            },
          },
          required: ["email"],
          additionalProperties: false,
        },
      ],
    },
  })
  @ApiCreatedResponse({ description: "Member added to board" })
  @ApiBadRequestResponse({ description: "Either userId or email is required" })
  @ApiForbiddenResponse({ description: "Insufficient permissions or already a member" })
  @ApiNotFoundResponse({ description: "User not found" })
  async addMember(
    @Param("id") id: string,
    @Body() body: { userId?: string; email?: string; role?: BoardMemberRole },
    @Request() req,
  ) {
    let memberUserId = body.userId;
    if (!memberUserId && body.email) {
      const found = await this.usersService.findByEmailInsensitive(
        String(body.email),
      );
      if (!found) {
        throw new NotFoundException("User not found");
      }
      memberUserId = found.id;
    }
    if (!memberUserId) {
      throw new BadRequestException("Either userId or email is required");
    }

    return this.boardsService.addMember(
      id,
      req.user.id,
      memberUserId,
      body.role,
      req.user.role,
    );
  }

  @Delete(":id/members/:userId")
  removeMember(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Request() req,
  ) {
    return this.boardsService.removeMember(
      id,
      req.user.id,
      userId,
      req.user.role,
    );
  }

  @Post(":id/labels")
  createLabel(
    @Param("id") id: string,
    @Body() body: { name: string; color: string },
    @Request() req,
  ) {
    return this.boardsService.createLabel(
      id,
      body.name,
      body.color,
      req.user.id,
      req.user.role,
    );
  }

  @Get(":id/labels")
  getLabels(@Param("id") id: string, @Request() req) {
    return this.boardsService.getLabels(id, req.user.id, req.user.role);
  }

  @Get(":id/activities")
  getActivities(
    @Param("id") id: string,
    @Request() req,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const p = page ? parseInt(page, 10) : undefined;
    const ps = pageSize ? parseInt(pageSize, 10) : undefined;
    return this.boardsService.getActivities(id, req.user.id, {
      page: p,
      pageSize: ps,
    });
  }

  @Get(":id/activities/export")
  @ApiOperation({ summary: "Export board activities as CSV" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiQuery({
    name: "format",
    required: false,
    description: "Export format",
    enum: ["csv"],
    example: "csv",
  })
  @ApiQuery({
    name: "cardId",
    required: false,
    description: "Filter by card ID",
  })
  @ApiQuery({
    name: "userId",
    required: false,
    description: "Filter by user ID",
  })
  @ApiOkResponse({ description: "CSV file content" })
  async exportActivities(
    @Param("id") id: string,
    @Request() req,
    @Query("format") format: "csv" = "csv",
    @Query("cardId") cardId?: string,
    @Query("userId") userId?: string,
    @Res() res?: Response,
  ) {
    if (format && format !== "csv") {
      throw new BadRequestException("Only CSV export is supported");
    }
    const csv = await this.boardsService.exportActivitiesCsv(id, req.user.id, {
      cardId,
      userId,
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=board-${id}-activities-${Date.now()}.csv`,
    );
    return res.send(csv);
  }
}
