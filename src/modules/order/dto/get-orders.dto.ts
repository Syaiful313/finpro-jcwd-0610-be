import { OrderStatus } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
} from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

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
  readonly outletId?: string;

  @IsOptional()
  @IsNumberString(
    {},
    {
      message: "Employee ID harus berupa angka",
    },
  )
  readonly employeeId?: string;

  @IsOptional()
  @IsDateString(
    {},
    {
      message: "Format tanggal mulai harus YYYY-MM-DD",
    },
  )
  readonly startDate?: string;

  @IsOptional()
  @IsDateString(
    {},
    {
      message: "Format tanggal akhir harus YYYY-MM-DD",
    },
  )
  readonly endDate?: string;
}
