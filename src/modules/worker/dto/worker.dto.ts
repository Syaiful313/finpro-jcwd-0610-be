import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { OrderStatus } from "@prisma/client";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

export class GetWorkerJobsDto extends PaginationQueryParams {
  @IsOptional()
  @IsEnum(OrderStatus)
  readonly status?: OrderStatus;

  @IsOptional()
  @IsString()
  readonly search?: string;

  @IsOptional()
  @IsDateString()
  readonly dateFrom?: string;

  @IsOptional()
  @IsDateString()
  readonly dateTo?: string;
}

export class GetWorkerHistoryDto extends PaginationQueryParams {
  @IsOptional()
  @IsDateString()
  readonly dateFrom?: string;

  @IsOptional()
  @IsDateString()
  readonly dateTo?: string;
}

class OrderItemDto {
  @IsInt()
  @IsNotEmpty()
  readonly laundryItemId?: number;

  @IsInt()
  @IsNotEmpty()
  readonly quantity?: number;
}

export class ProcessOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  readonly items?: OrderItemDto[];

  @IsOptional()
  @IsString()
  readonly notes?: string;
}

export class RequestBypassDto {
  @IsString()
  @IsNotEmpty()
  readonly reason!: string;
}

export class CompleteOrderProcessDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  readonly items?: OrderItemDto[];

  @IsOptional()
  @IsString()
  readonly notes?: string;
}
