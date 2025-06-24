import { Transform } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

export class GetEmployeePerformanceDTO extends PaginationQueryParams {
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  readonly outletId?: number;

  @IsOptional()
  @IsDateString()
  readonly startDate?: string;

  @IsOptional()
  @IsDateString()
  readonly endDate?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  readonly employeeId?: number;

  @IsOptional()
  @IsString()
  @IsIn(["WORKER", "DRIVER"])
  readonly role?: "WORKER" | "DRIVER";

  @IsOptional()
  @IsString()
  @IsIn([
    "totalJobs",
    "employeeName",
    "outletName",
    "completionRate",
    "createdAt",
  ])
  readonly sortBy: string = "totalJobs";
}
