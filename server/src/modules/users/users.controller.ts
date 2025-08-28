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
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { NotificationPreferencesDto } from "./dto/notification-preferences.dto";
import { UiPreferencesDto } from "./dto/ui-preferences.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import * as fs from "fs";

// Ensure upload directory exists to avoid ENOENT during file writes
const UPLOAD_DIR =
  process.env.UPLOAD_PATH || process.env.UPLOAD_DIR || "./uploads";
try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch {
  // Ignore directory creation errors here; multer will surface errors if any
}

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Request() req) {
    if (req.user.role !== "ADMIN") {
      throw new ForbiddenException("Only admins can list users");
    }
    return this.usersService.findAll();
  }

  // Lightweight lookup for inviting users by email (non-admins allowed)
  @Get("lookup")
  async lookupByEmail(@Query("email") email?: string) {
    if (!email || typeof email !== "string") {
      throw new BadRequestException("Email is required");
    }
    const user = await this.usersService.findByEmailInsensitive(email);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  @Get("profile")
  async getProfile(@Request() req) {
    // Return a fresh snapshot to ensure fields like isPro/proExpiresAt are up-to-date
    return this.usersService.findById(req.user.id);
  }

  @Patch("profile")
  async updateMyProfile(@Body() body: any, @Request() req) {
    // Accept client payload but only persist supported fields
    const { firstName, lastName } = body ?? {};
    const payload: UpdateUserDto = {} as UpdateUserDto;
    if (typeof firstName === "string") payload.firstName = firstName;
    if (typeof lastName === "string") payload.lastName = lastName;

    if (Object.keys(payload).length === 0) {
      // Nothing to update; return a fresh snapshot
      return this.usersService.findById(req.user.id);
    }
    return this.usersService.update(req.user.id, payload);
  }

  @Post("change-password")
  async changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    await this.usersService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
    return { success: true, message: "Password updated successfully" };
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

  @Get("notifications")
  async getMyNotifications(@Request() req) {
    return this.usersService.getNotificationPreferences(req.user.id);
  }

  @Patch("notifications")
  async updateMyNotifications(@Body() body: any, @Request() req) {
    // Normalize client keys to server-side canonical keys
    const incoming = (body as Record<string, any>) || {};
    const normalized: Record<string, any> = { ...incoming };
    if ("taskComments" in incoming) {
      normalized.comments = !!incoming.taskComments;
      delete (normalized as any).taskComments;
    }
    if ("taskDueDates" in incoming) {
      normalized.taskDeadlines = !!incoming.taskDueDates;
      delete (normalized as any).taskDueDates;
    }
    if ("weeklyDigest" in incoming) {
      normalized.weeklyReport = !!incoming.weeklyDigest;
      delete (normalized as any).weeklyDigest;
    }

    const current = await this.usersService.getNotificationPreferences(
      req.user.id,
    );
    const safeCurrent = (
      typeof current === "object" && current !== null ? current : {}
    ) as Record<string, any>;
    const merged = { ...safeCurrent, ...normalized };
    return this.usersService.updateNotificationPreferences(req.user.id, merged);
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
    // Use RAW prefs here so computed fallbacks (like labelDisplay) don't block legacy mapping
    const current = await this.usersService.getRawUiPreferences(id);
    const safeCurrent = (
      typeof current === "object" && current !== null ? current : {}
    ) as Record<string, any>;
    const incoming = (dto as any) || {};
    const incomingBoard = (incoming.board || {}) as Record<string, any>;
    const mergedBoard = {
      ...(safeCurrent.board || {}),
      ...incomingBoard,
    } as Record<string, any>;
    // Back-compat mapping: if client sends legacy alwaysShowLabels and does not explicitly set labelDisplay
    // (including when the DTO defines labelDisplay as an own property with value undefined),
    // then derive labelDisplay from alwaysShowLabels.
    if (
      typeof (incomingBoard as any).labelDisplay === "undefined" &&
      Object.prototype.hasOwnProperty.call(incomingBoard, "alwaysShowLabels")
    ) {
      mergedBoard.labelDisplay = incomingBoard.alwaysShowLabels
        ? "chips"
        : "blocks";
    }
    const merged = {
      ...safeCurrent,
      board: mergedBoard,
    };
    return this.usersService.updateUiPreferences(id, merged);
  }

  @Get("preferences")
  async getMyPreferences(@Request() req) {
    return this.usersService.getUiPreferences(req.user.id);
  }

  @Patch("preferences")
  async updateMyPreferences(@Body() body: any, @Request() req) {
    // Merge against RAW prefs to avoid persisting computed defaults
    const current = await this.usersService.getRawUiPreferences(req.user.id);
    const safeCurrent = (
      typeof current === "object" && current !== null ? current : {}
    ) as Record<string, any>;
    const incoming = (body as Record<string, any>) || {};

    const merged: Record<string, any> = {
      ...safeCurrent,
      board: { ...((safeCurrent as any)?.board || {}) },
    };
    if (typeof incoming.theme === "string") merged.theme = incoming.theme;
    if (typeof incoming.language === "string")
      merged.language = incoming.language;
    if (typeof incoming.timezone === "string")
      merged.timezone = incoming.timezone;

    return this.usersService.updateUiPreferences(req.user.id, merged);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Request() req) {
    if (req.user.id !== id && req.user.role !== "ADMIN") {
      throw new ForbiddenException("Not authorized to view this user");
    }
    return this.usersService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(":id")
  async updateUser(
    @Param("id") id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req,
  ) {
    // Allow self-update or admin updates; block others
    if (req.user.id !== id && req.user.role !== "ADMIN") {
      throw new ForbiddenException("Not authorized to update this user");
    }

    try {
      // Prevent privilege escalation: non-admins cannot update the 'role'
      const safeDto: UpdateUserDto = { ...updateUserDto };
      if (req.user.role !== "ADMIN") {
        delete (safeDto as any).role;
      }
      const user = await this.usersService.update(id, safeDto);
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
        destination: UPLOAD_DIR,
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB (align with client)
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          "image/jpeg",
          "image/jpg",
          "image/pjpeg",
          "image/png",
          "image/x-png",
          "image/gif",
          "image/webp",
          "image/avif",
        ];
        const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"];
        const mime = (file.mimetype || "").toLowerCase();
        const ext = extname(file.originalname || "").toLowerCase();
        const mimeOk = !!mime && allowedMimes.includes(mime);
        const extOk = !!ext && allowedExts.includes(ext);
        if (mimeOk || extOk) {
          return cb(null, true);
        }
        // Do not throw from fileFilter to avoid aborting the stream (causes ECONNRESET)
        (req as any).fileValidationError =
          "Only image files are allowed (jpeg, png, gif, webp, avif)";
        return cb(null, false);
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
      const msg = (req as any)?.fileValidationError || "No file uploaded";
      throw new BadRequestException(msg);
    }
    const avatarPath = `/uploads/${file.filename}`;
    const user = await this.usersService.updateAvatar(id, avatarPath);
    return { success: true, user };
  }

  // Avatar upload for current user (matches client: field name 'avatar', returns user directly)
  @Post("avatar")
  @UseInterceptors(
    FileInterceptor("avatar", {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB (align with client)
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          "image/jpeg",
          "image/jpg",
          "image/pjpeg",
          "image/png",
          "image/x-png",
          "image/gif",
          "image/webp",
          "image/avif",
        ];
        const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"];
        const mime = (file.mimetype || "").toLowerCase();
        const ext = extname(file.originalname || "").toLowerCase();
        const mimeOk = !!mime && allowedMimes.includes(mime);
        const extOk = !!ext && allowedExts.includes(ext);
        if (mimeOk || extOk) {
          return cb(null, true);
        }
        (req as any).fileValidationError =
          "Only image files are allowed (jpeg, png, gif, webp, avif)";
        return cb(null, false);
      },
    }),
  )
  async uploadMyAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) {
      const msg = (req as any)?.fileValidationError || "No file uploaded";
      throw new BadRequestException(msg);
    }
    const avatarPath = `/uploads/${file.filename}`;
    const user = await this.usersService.updateAvatar(req.user.id, avatarPath);
    // Return the updated user directly to match client expectations
    return user;
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
}
