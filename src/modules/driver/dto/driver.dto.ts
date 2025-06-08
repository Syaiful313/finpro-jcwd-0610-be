import { IsNumber, IsOptional, IsString } from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

export class GetDriverDTO extends PaginationQueryParams {
  @IsOptional()
  @IsString()
  readonly search?: string;
}
