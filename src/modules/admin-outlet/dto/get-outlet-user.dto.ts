import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryParams } from "../../pagination/dto/pagination.dto";

enum OutletUserRole {
  WORKER = "WORKER",
  DRIVER = "DRIVER",
}

enum Provider {
  GOOGLE = "GOOGLE",
  CREDENTIAL = "CREDENTIAL",
}

export class GetOutletUsersDTO extends PaginationQueryParams {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(OutletUserRole, {
    message: "Role filter can only be CUSTOMER or WORKER",
  })
  role?: OutletUserRole;
}
