import { OrderStatus, WorkerTypes } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import { PaginationService } from "../../pagination/pagination.service";

export class GetWorkerOrdersDto extends PaginationService {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

export class GetWorkerHistoryDto extends PaginationService {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class StartProcessingOrderDto {
  //   nunggu dlu nanti
}

export class CompleteOrderProcessDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
