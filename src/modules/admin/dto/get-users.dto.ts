import { IsOptional, IsString } from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";
import { Role } from "@prisma/client";

export class GetUsersDTO extends PaginationQueryParams {
  @IsOptional()
  @IsString()
  readonly search?: string;

  @IsOptional()
  @IsString()
  readonly role?: Role;
}
