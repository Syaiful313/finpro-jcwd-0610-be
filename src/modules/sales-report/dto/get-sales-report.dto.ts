import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from "class-validator";

export enum ReportPeriod {
  DAILY = "daily",
  MONTHLY = "monthly",
  YEARLY = "yearly",
}

export class GetSalesReportDTO {
  @IsOptional()
  @IsDateString(
    {},
    { message: "Start date must be a valid date string (YYYY-MM-DD)" },
  )
  readonly startDate?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: "End date must be a valid date string (YYYY-MM-DD)" },
  )
  readonly endDate?: string;

  @IsOptional()
  @IsEnum(ReportPeriod, {
    message: "Period must be one of: daily, monthly, yearly",
  })
  readonly period?: ReportPeriod = ReportPeriod.MONTHLY;

  @IsOptional()
  @Transform(({ value }) => {
    const parsed = parseInt(value);
    return isNaN(parsed) ? undefined : parsed;
  })
  @IsNumber({}, { message: "Outlet ID must be a number" })
  @Min(1, { message: "Outlet ID must be greater than 0" })
  readonly outletId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    const parsed = parseInt(value);
    return isNaN(parsed) ? 1 : parsed;
  })
  @IsNumber({}, { message: "Page must be a number" })
  @Min(1, { message: "Page must be greater than 0" })
  readonly page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => {
    const parsed = parseInt(value);
    return isNaN(parsed) ? 10 : parsed;
  })
  @IsNumber({}, { message: "Take must be a number" })
  @Min(1, { message: "Take must be greater than 0" })
  @Max(100, { message: "Take cannot exceed 100" })
  readonly take?: number = 10;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  readonly all?: boolean = false;

  @ValidateIf((o) => o.startDate && o.endDate)
  @Transform(({ obj }) => {
    if (obj.startDate && obj.endDate) {
      const start = new Date(obj.startDate);
      const end = new Date(obj.endDate);
      return start <= end;
    }
    return true;
  })
  @IsBoolean({ message: "End date must be after start date" })
  readonly isDateRangeValid?: boolean = true;
}

export class GetOutletComparisonDTO {
  @IsOptional()
  @IsDateString(
    {},
    { message: "Start date must be a valid date string (YYYY-MM-DD)" },
  )
  readonly startDate?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: "End date must be a valid date string (YYYY-MM-DD)" },
  )
  readonly endDate?: string;

  @IsOptional()
  @IsEnum(ReportPeriod, {
    message: "Period must be one of: daily, monthly, yearly",
  })
  readonly period?: ReportPeriod = ReportPeriod.MONTHLY;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || 1)
  @IsNumber({}, { message: "Page must be a number" })
  @Min(1, { message: "Page must be greater than 0" })
  readonly page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || 20)
  @IsNumber({}, { message: "Take must be a number" })
  @Min(1, { message: "Take must be greater than 0" })
  @Max(50, { message: "Take cannot exceed 50 for outlet comparison" })
  readonly take?: number = 20;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  readonly all?: boolean = false;

  @ValidateIf((o) => o.startDate && o.endDate)
  @Transform(({ obj }) => {
    if (obj.startDate && obj.endDate) {
      const start = new Date(obj.startDate);
      const end = new Date(obj.endDate);
      return start <= end;
    }
    return true;
  })
  @IsBoolean({ message: "End date must be after start date" })
  readonly isDateRangeValid?: boolean = true;
}

export class ExportSalesReportDTO extends GetSalesReportDTO {
  @IsOptional()
  @IsEnum(["excel", "pdf"], {
    message: "Export format must be either excel or pdf",
  })
  readonly format?: "excel" | "pdf" = "excel";

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  readonly includeDetails?: boolean = true;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  readonly includeCharts?: boolean = false;
}


export class GetTotalIncomeDTO {
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = parseInt(value);
    return isNaN(parsed) ? undefined : parsed;
  })
  @IsNumber({}, { message: "Outlet ID must be a number" })
  @Min(1, { message: "Outlet ID must be greater than 0" })
  readonly outletId?: number;

  @IsOptional()
  @IsDateString(
    {},
    { message: "Start date must be a valid date string (YYYY-MM-DD)" },
  )
  readonly startDate?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: "End date must be a valid date string (YYYY-MM-DD)" },
  )
  readonly endDate?: string;
}


export interface SalesReportResponse {
  data: Array<{
    period: string;
    totalIncome: number;
    totalOrders: number;
    outletId?: number;
    outletName?: string;
  }>;
  summary: {
    totalIncome: number;
    totalOrders: number;
    averageOrderValue: number;
    performance?: {
      current: number;
      previous: number;
      changePercentage: number;
      changeDirection: "increase" | "decrease" | "stable";
    };
  };
  meta: {
    hasNext: boolean;
    hasPrevious: boolean;
    page: number;
    perPage: number;
    total: number;
  };
}

export interface OutletComparisonResponse {
  data: Array<{
    outletId: number;
    outletName: string;
    totalIncome: number;
    totalOrders: number;
    averageOrderValue: number;
  }>;
  meta: {
    hasNext: boolean;
    hasPrevious: boolean;
    page: number;
    perPage: number;
    total: number;
  };
}

export interface TotalIncomeResponse {
  totalIncome: number;
  totalOrders: number;
  averageOrderValue: number;
}
