import { IsBoolean, IsOptional } from "class-validator";

export class NotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  boardInvites?: boolean;

  @IsOptional()
  @IsBoolean()
  taskAssignments?: boolean;

  @IsOptional()
  @IsBoolean()
  taskDeadlines?: boolean;

  @IsOptional()
  @IsBoolean()
  comments?: boolean;

  @IsOptional()
  @IsBoolean()
  weeklyReport?: boolean;
}
