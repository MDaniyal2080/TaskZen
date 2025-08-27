import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Request,
  Res,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import {
  LoginDto,
  RegisterDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from "./dto/auth.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CsrfGuard } from "../../common/guards/csrf.guard";
import { Response } from "express";
import { FeatureFlag } from "../../common/decorators/feature-flag.decorator";
import { Throttle } from "@nestjs/throttler";
import { UsersService } from "../users/users.service";
import { ChangePasswordDto } from "../users/dto/change-password.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 5, ttl: 900 } })
  @Post("login")
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 5, ttl: 900 } })
  @Post("register")
  @FeatureFlag("enableRegistration")
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 5, ttl: 900 } })
  @Post("forgot-password")
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 5, ttl: 900 } })
  @Post("reset-password")
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get("csrf")
  async getCsrf(@Res({ passthrough: true }) res: Response) {
    const token = CsrfGuard.generateToken();
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("csrf-token", token, {
      httpOnly: false,
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
    });
    return { csrfToken: token };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async getProfile(@Request() req) {
    // Always return a fresh user snapshot from the DB so fields like isPro/proExpiresAt are accurate
    return this.usersService.findById(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("refresh")
  async refresh(@Request() req) {
    // Return a new token using a fresh user snapshot so role/isActive/email are up-to-date
    const user = await this.usersService.findById(req.user.id);
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      isActive: user.isActive,
    };
    return {
      user,
      token: await this.authService.generateToken(payload),
    };
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
