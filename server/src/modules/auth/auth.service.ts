import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ServiceUnavailableException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UsersService } from "../users/users.service";
import {
  LoginDto,
  RegisterDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from "./dto/auth.dto";
import { SystemSettingsService } from "../../common/services/system-settings.service";
import { LoginAttemptsService } from "../../common/services/login-attempts.service";
import { PasswordResetService } from "../../common/services/password-reset.service";
import { EmailService } from "../email/email.service";
import type { User } from "@prisma/client";
import type { SecuritySettings } from "../../common/services/system-settings.service";

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private readonly settingsService: SystemSettingsService,
    private readonly loginAttempts: LoginAttemptsService,
    private readonly passwordReset: PasswordResetService,
    private readonly emailService: EmailService,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<Omit<User, "password"> | null> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password: _password, ...result } = user;
      return result as Omit<User, "password">;
    }
    return null;
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = (dto.email || "").toLowerCase().trim();
    const user = await this.usersService.findByEmail(email);
    // Always respond success to avoid user enumeration
    if (!user) {
      return {
        success: true,
        message: "If the email exists, you will receive a reset link shortly.",
      };
    }

    const ttlSec = 900; // 15 minutes
    const token = await this.passwordReset.createToken(email, ttlSec);
    // Fire-and-forget email sending; do not block or fail flow on email errors
    void this.emailService
      .sendPasswordResetEmail(email, token)
      .catch((err) =>
        console.warn("Password reset email failed:", err?.message || err),
      );
    return {
      success: true,
      message: "If the email exists, you will receive a reset link shortly.",
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = await this.passwordReset.consumeToken(dto.token);
    if (!email) {
      throw new BadRequestException("Invalid or expired token");
    }

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException("Invalid token");
    }

    const settings = await this.settingsService.getSettings();
    const requiredLen = Math.max(
      8,
      Number(settings.security?.passwordMinLength ?? 8),
    );
    if ((dto.newPassword || "").length < requiredLen) {
      throw new BadRequestException(
        `Password must be at least ${requiredLen} characters long`,
      );
    }

    // Use UsersService.update to handle hashing
    await this.usersService.update(user.id, {
      password: dto.newPassword,
    });
    return { success: true };
  }

  async login(loginDto: LoginDto) {
    // Load settings and compute security parameters
    const settings = await this.settingsService.getSettings();
    const security: Partial<SecuritySettings> = settings.security ?? {};
    const maxAttempts = Math.max(1, Number(security.maxLoginAttempts ?? 5));
    const attemptsTtlSec = Math.max(
      60,
      Number(security.loginAttemptWindowSec ?? 900),
    ); // default 15m

    // Block if locked out for too many attempts
    if (await this.loginAttempts.isLocked(loginDto.email, maxAttempts)) {
      throw new HttpException(
        "Too many login attempts. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      // Count a failed attempt
      await this.loginAttempts.increment(loginDto.email, attemptsTtlSec);
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Account is deactivated");
    }

    // During maintenance, only admins are allowed to log in
    if (settings.maintenance?.enabled && user.role !== "ADMIN") {
      throw new ServiceUnavailableException(
        "The service is under maintenance. Only admins can log in.",
      );
    }

    // Successful login resets attempts
    await this.loginAttempts.reset(loginDto.email);

    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      isActive: user.isActive,
    };
    return {
      user,
      token: await this.generateToken(payload),
    };
  }

  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException("User with this email already exists");
    }

    const existingUsername = await this.usersService.findByUsername(
      registerDto.username,
    );
    if (existingUsername) {
      throw new ConflictException("Username is already taken");
    }

    // Enforce dynamic password policy
    const settings = await this.settingsService.getSettings();
    const requiredLen = Math.max(
      8,
      Number(settings.security?.passwordMinLength ?? 8),
    );
    if ((registerDto.password || "").length < requiredLen) {
      throw new BadRequestException(
        `Password must be at least ${requiredLen} characters long`,
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    // Create user
    const user = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
    });

    const { password: _password, ...result } = user;
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      isActive: user.isActive,
    };

    // Fire-and-forget welcome email (do not block response)
    void this.emailService
      .sendWelcomeEmail(user.email, user.username || user.email)
      .catch((err) =>
        console.warn("Welcome email failed:", err?.message || err),
      );

    return {
      user: result,
      token: await this.generateToken(payload),
    };
  }

  async validateToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException("Invalid token");
      }
      return user;
    } catch (error) {
      throw new UnauthorizedException("Invalid token");
    }
  }

  public async generateToken(payload: {
    email: string;
    sub: string;
    role: string;
    isActive: boolean;
  }) {
    const settings = await this.settingsService.getSettings();
    const minutes = Math.max(
      1,
      Number(settings.security?.sessionTimeout ?? 10080),
    ); // default 7d
    const expiresInSec = Math.floor(minutes * 60);
    return this.jwtService.sign(payload, { expiresIn: expiresInSec });
  }
}
