import { IsBooleanString, IsIn, IsOptional, IsString } from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

const statusList = ["pending", "approved", "rejected"];

export class GetBypassRequestListDto extends PaginationQueryParams {
  @IsOptional()
  @IsString()
  @IsIn(statusList)
  readonly status?: string;

  @IsOptional()
  @IsBooleanString()
  readonly includeCompleted?: string;

  @IsOptional()
  @IsString()
  readonly dateFrom?: string;

  @IsOptional()
  @IsString()
  readonly dateTo?: string;
}
