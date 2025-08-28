import { IsBoolean, IsOptional, ValidateNested, IsIn } from "class-validator";
import { Type } from "class-transformer";

class BoardPreferencesDto {
  @IsOptional()
  @IsBoolean()
  compactCardView?: boolean;

  @IsOptional()
  @IsBoolean()
  alwaysShowLabels?: boolean;

  @IsOptional()
  @IsIn(["chips", "blocks", "hover"])
  labelDisplay?: "chips" | "blocks" | "hover";

  @IsOptional()
  @IsBoolean()
  enableAnimations?: boolean;
}

export class UiPreferencesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BoardPreferencesDto)
  board?: BoardPreferencesDto;
}
