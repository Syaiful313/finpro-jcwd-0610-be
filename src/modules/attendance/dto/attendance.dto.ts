import { IsNumber, IsOptional, IsString } from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

export class GetAttendanceHistoryDTO extends PaginationQueryParams {
  @IsOptional()
  @IsString()
  readonly startDate?: string;

  @IsOptional()
  @IsString()
  readonly endDate?: string;

  @IsOptional()
  @IsNumber()
  readonly employeeId?: number;

  @IsOptional()
  @IsString()
  readonly search?: string;
}

export class GetAttendanceReportDTO extends PaginationQueryParams {
  @IsOptional()
  @IsString()
  readonly startDate?: string;

  @IsOptional()
  @IsString()
  readonly endDate?: string;

  @IsOptional()
  @IsNumber()
  readonly employeeId?: number;

  @IsOptional()
  @IsString()
  readonly search?: string;
}
