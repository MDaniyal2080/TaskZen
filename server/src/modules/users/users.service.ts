import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import * as bcrypt from "bcryptjs";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({
      data: createUserDto,
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        isPro: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        isPro: true,
        proExpiresAt: true,
        isActive: true,
        notificationPreferences: true,
        uiPreferences: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { password, ...data } = updateUserDto;

    const updateData: any = { ...data };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        isPro: true,
        proExpiresAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async upgradeToPro(userId: string, duration: string) {
    const durationDays = duration === "yearly" ? 365 : 30;

    // Extend from current expiration if the user is already Pro and not expired.
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { proExpiresAt: true },
    });
    const now = new Date();
    const base =
      current?.proExpiresAt && current.proExpiresAt > now
        ? new Date(current.proExpiresAt)
        : now;
    const expiresAt = new Date(base.getTime());
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isPro: true,
        proExpiresAt: expiresAt,
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        isPro: true,
        proExpiresAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async downgradeToFree(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isPro: false,
        proExpiresAt: null,
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        isPro: true,
        proExpiresAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async checkProExpiration(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isPro: true, proExpiresAt: true },
    });

    if (user?.isPro && user.proExpiresAt && user.proExpiresAt < new Date()) {
      // Pro expired, downgrade to free
      await this.downgradeToFree(userId);
      return false;
    }

    return user?.isPro || false;
  }

  async remove(id: string) {
    const user = await this.findById(id);

    return this.prisma.user.delete({
      where: { id },
    });
  }

  async deactivate(id: string) {
    const user = await this.findById(id);

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        isPro: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async activate(id: string) {
    const user = await this.findById(id);

    return this.prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        isPro: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async upgradeToProUser(id: string, expiresAt?: Date) {
    const user = await this.findById(id);

    return this.prisma.user.update({
      where: { id },
      data: {
        isPro: true,
        proExpiresAt: expiresAt,
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        isPro: true,
        proExpiresAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new BadRequestException("Current password is incorrect");
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    return { success: true };
  }

  // Notification preferences
  async getNotificationPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const defaults = {
      emailNotifications: true,
      boardInvites: true,
      taskAssignments: true,
      taskDeadlines: true,
      comments: true,
      weeklyReport: false,
    };

    return user.notificationPreferences ?? defaults;
  }

  async updateNotificationPreferences(userId: string, prefs: any) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { notificationPreferences: prefs },
      select: { notificationPreferences: true },
    });
    return updated.notificationPreferences;
  }

  // UI preferences
  async getUiPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { uiPreferences: true },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const defaults = {
      board: {
        compactCardView: false,
        alwaysShowLabels: true,
        enableAnimations: true,
      },
    };

    return user.uiPreferences ?? defaults;
  }

  async updateUiPreferences(userId: string, prefs: any) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { uiPreferences: prefs },
      select: { uiPreferences: true },
    });
    return updated.uiPreferences;
  }

  // Avatar update
  async updateAvatar(userId: string, avatarPath: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarPath },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        isPro: true,
        proExpiresAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
