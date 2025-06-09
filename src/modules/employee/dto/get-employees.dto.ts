import { IsNumberString, IsOptional } from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

export class GetEmployeesDTO extends PaginationQueryParams {
  @IsOptional()
  @IsNumberString()
  readonly outletId?: string;
}
