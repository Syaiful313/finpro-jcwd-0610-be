// dto/get-bypass-requests.dto.ts
import { IsEnum, IsOptional } from "class-validator";
import { BypassStatus, WorkerTypes } from "@prisma/client";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

export class GetBypassRequestsDTO extends PaginationQueryParams {
  @IsOptional()
  @IsEnum(BypassStatus)
  readonly status?: BypassStatus;

  @IsOptional()
  @IsEnum(WorkerTypes)
  readonly workerType?: WorkerTypes;
}