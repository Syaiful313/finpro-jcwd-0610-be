import {
  IsOptional,
  IsString,
  IsNumberString,
  IsDateString,
  IsEnum,
} from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";
import { OrderStatus } from "@prisma/client";

export class GetOrdersDTO extends PaginationQueryParams {
  @IsOptional()
  @IsString()
  readonly search?: string;

  @IsOptional()
  @IsEnum(OrderStatus, {
    message:
      "Status harus salah satu dari: " + Object.values(OrderStatus).join(", "),
  })
  readonly status?: OrderStatus;

  @IsOptional()
  @IsNumberString(
    {},
    {
      message: "Outlet ID harus berupa angka",
    },
  )
  readonly outletId?: string; // Only for Super Admin

  @IsOptional()
  @IsNumberString(
    {},
    {
      message: "Employee ID harus berupa angka",
    },
  )
  readonly employeeId?: string; // For tracking by worker/driver

  @IsOptional()
  @IsDateString(
    {},
    {
      message: "Format tanggal mulai harus YYYY-MM-DD",
    },
  )
  readonly startDate?: string; // For date range filtering

  @IsOptional()
  @IsDateString(
    {},
    {
      message: "Format tanggal akhir harus YYYY-MM-DD",
    },
  )
  readonly endDate?: string; // For date range filtering
}
