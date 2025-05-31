import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

export class GetOutletsDTO extends PaginationQueryParams {
  @IsOptional()
  @IsString()
  readonly search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
