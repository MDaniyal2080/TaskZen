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
  NotFoundException,
  ForbiddenException,
  Put,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { NotificationPreferencesDto } from "./dto/notification-preferences.dto";
import { UiPreferencesDto } from "./dto/ui-preferences.dto";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get("profile")
  getProfile(@Request() req) {
    return req.user;
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.usersService.findById(id);
  }

  @Get(":id/notifications")
  async getNotifications(@Param("id") id: string, @Request() req) {
    // Only self or admin can view
    if (req.user.id !== id && req.user.role !== "ADMIN") {
      throw new ForbiddenException("Not authorized to view this resource");
    }
    return this.usersService.getNotificationPreferences(id);
  }

  @Put(":id/notifications")
  async updateNotifications(
    @Param("id") id: string,
    @Body() dto: NotificationPreferencesDto,
    @Request() req,
  ) {
    // Only self or admin can update
    if (req.user.id !== id && req.user.role !== "ADMIN") {
      throw new ForbiddenException("You can only update your own preferences");
    }
    // Merge with existing to preserve unspecified flags
    const current = await this.usersService.getNotificationPreferences(id);
    const safeCurrent = (
      typeof current === "object" && current !== null ? current : {}
    ) as Record<string, any>;
    const merged = { ...safeCurrent, ...(dto as any) };
    return this.usersService.updateNotificationPreferences(id, merged);
  }

  @Get(":id/ui-preferences")
  async getUiPreferences(@Param("id") id: string, @Request() req) {
    if (req.user.id !== id && req.user.role !== "ADMIN") {
      throw new ForbiddenException("Not authorized to view this resource");
    }
    return this.usersService.getUiPreferences(id);
  }

  @Put(":id/ui-preferences")
  async updateUiPreferences(
    @Param("id") id: string,
    @Body() dto: UiPreferencesDto,
    @Request() req,
  ) {
    if (req.user.id !== id && req.user.role !== "ADMIN") {
      throw new ForbiddenException("You can only update your own preferences");
    }
    const current = await this.usersService.getUiPreferences(id);
    const safeCurrent = (
      typeof current === "object" && current !== null ? current : {}
    ) as Record<string, any>;
    const incoming = (dto as any) || {};
    const merged = {
      ...safeCurrent,
      board: {
        ...(safeCurrent.board || {}),
        ...(incoming.board || {}),
      },
    };
    return this.usersService.updateUiPreferences(id, merged);
  }

  @UseGuards(JwtAuthGuard)
  @Put(":id")
  async updateUser(
    @Param("id") id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req,
  ) {
    // Users can only update their own profile
    if (req.user.id !== id && req.user.role !== "ADMIN") {
      throw new ForbiddenException("You can only update your own profile");
    }

    try {
      const user = await this.usersService.update(id, updateUserDto);
      if (!user) {
        throw new NotFoundException("User not found");
      }

      return user;
    } catch (err) {
      this.logger.error(
        `updateUser error for ${id}: ${err instanceof Error ? err.message : err}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }

  // Avatar upload
  @Post(":id/avatar")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: "./uploads",
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
      fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException("Only image files are allowed"), false);
      },
    }),
  )
  async uploadAvatar(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (req.user.id !== id && req.user.role !== "ADMIN") {
      throw new ForbiddenException("You can only update your own avatar");
    }
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    const avatarPath = `/uploads/${file.filename}`;
    const user = await this.usersService.updateAvatar(id, avatarPath);
    return { success: true, user };
  }

  @UseGuards(JwtAuthGuard)
  @Post("upgrade-pro")
  async upgradeToPro(@Request() req, @Body() body: { duration?: string }) {
    const duration = body.duration || "monthly";
    const user = await this.usersService.upgradeToPro(req.user.id, duration);
    return {
      success: true,
      user,
      message: "Successfully upgraded to Pro!",
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post("downgrade")
  async downgradeToFree(@Request() req) {
    const user = await this.usersService.downgradeToFree(req.user.id);
    return {
      success: true,
      user,
      message: "Downgraded to Free plan",
    };
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Request() req) {
    if (req.user.id !== id && req.user.role !== "ADMIN") {
      throw new ForbiddenException("Not authorized to delete this user");
    }
    return this.usersService.remove(id);
  }

  @Patch(":id/deactivate")
  deactivate(@Param("id") id: string, @Request() req) {
    if (req.user.role !== "ADMIN") {
      throw new ForbiddenException("Only admins can deactivate users");
    }
    return this.usersService.deactivate(id);
  }

  @Patch(":id/activate")
  activate(@Param("id") id: string, @Request() req) {
    if (req.user.role !== "ADMIN") {
      throw new ForbiddenException("Only admins can activate users");
    }
    return this.usersService.activate(id);
  }

  @Patch(":id/upgrade")
  upgradeToProUser(@Param("id") id: string, @Request() req) {
    if (req.user.role !== "ADMIN") {
      throw new ForbiddenException("Only admins can upgrade users");
    }
    // Set pro expiration to 1 year from now
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    return this.usersService.upgradeToProUser(id, expiresAt);
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  async changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    await this.usersService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
    return { success: true, message: "Password updated successfully" };
  }
}
