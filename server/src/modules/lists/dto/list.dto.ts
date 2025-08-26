import { IsString, IsOptional, IsBoolean, IsNumber } from "class-validator";

export class CreateListDto {
  @IsString()
  title: string;

  @IsString()
  boardId: string;
}

export class UpdateListDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsNumber()
  position?: number;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
