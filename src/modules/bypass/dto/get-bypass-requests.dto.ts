import { BypassStatus, WorkerTypes } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

export class GetBypassRequestsDTO extends PaginationQueryParams {
  @IsOptional()
  @IsEnum(BypassStatus)
  readonly status?: BypassStatus;

  @IsOptional()
  @IsEnum(WorkerTypes)
  readonly workerType?: WorkerTypes;
}
