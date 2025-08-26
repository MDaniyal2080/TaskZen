import {
  IsString,
  IsEmail,
  MinLength,
  IsOptional,
  IsEnum,
} from "class-validator";
import { UserRole } from "@prisma/client";

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
