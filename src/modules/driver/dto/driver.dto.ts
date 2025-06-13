import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

export class GetDriverDTO extends PaginationQueryParams {
  @IsOptional()
  @IsString()
  readonly search?: string;

  @IsOptional()
  readonly status?: "active" | "completed" | "all";

  @IsOptional()
  readonly jobType?: "pickup" | "delivery" | "all";

  @IsOptional()
  @IsDateString()
  readonly dateFrom?: string;

  @IsOptional()
  @IsDateString()
  readonly dateTo?: string;
}
