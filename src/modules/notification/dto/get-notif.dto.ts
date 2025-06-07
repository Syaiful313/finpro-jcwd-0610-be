import { IsOptional, IsString } from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

export class GetNotificationsDTO extends PaginationQueryParams {
  @IsOptional()
  @IsString()
  readonly search?: string;
}
