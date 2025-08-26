import { IsBoolean, IsOptional, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class BoardPreferencesDto {
  @IsOptional()
  @IsBoolean()
  compactCardView?: boolean;

  @IsOptional()
  @IsBoolean()
  alwaysShowLabels?: boolean;

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
