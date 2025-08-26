import { PartialType } from "@nestjs/mapped-types";
import { CreateBoardDto } from "./create-board.dto";
import { IsBoolean, IsOptional } from "class-validator";

export class UpdateBoardDto extends PartialType(CreateBoardDto) {
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
