import { Provider, Role } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from "class-validator";

export class CreateUserDTO {
  @IsNotEmpty()
  @IsString()
  readonly firstName!: string;

  @IsNotEmpty()
  @IsString()
  readonly lastName!: string;

  @IsNotEmpty()
  @IsEmail()
  readonly email!: string;

  @IsNotEmpty()
  @IsString()
  readonly password!: string;

  @IsOptional()
  @IsEnum(Role)
  readonly role?: Role = Role.CUSTOMER;

  @IsNotEmpty()
  @IsNumberString()
  @Matches(/^08[0-9]{8,11}$/, {
    message: "Phone number must start with 08 and be 10-13 digits long",
  })
  readonly phoneNumber!: string;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  readonly isVerified?: boolean = false;

  @IsOptional()
  @IsEnum(Provider)
  readonly provider?: Provider = Provider.CREDENTIAL;

  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value) : undefined))
  @IsInt()
  readonly notificationId?: number;

  @ValidateIf(
    (o) =>
      o.role === Role.OUTLET_ADMIN ||
      o.role === Role.WORKER ||
      o.role === Role.DRIVER,
  )
  @Transform(({ value }) => (value ? parseInt(value) : undefined))
  @IsInt({ message: "Outlet ID must be a valid integer" })
  readonly outletId?: number;

  @ValidateIf(
    (o) =>
      o.role === Role.OUTLET_ADMIN ||
      o.role === Role.WORKER ||
      o.role === Role.DRIVER,
  )
  @IsNotEmpty({ message: "NPWP is required for employee roles" })
  @IsString()
  @Matches(/^[0-9]{15}$/, {
    message: "NPWP must be exactly 15 digits",
  })
  readonly npwp?: string;
}
