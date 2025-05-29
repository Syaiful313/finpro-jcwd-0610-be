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
  Max,
  Min,
} from "class-validator";

enum OutletUserRole {
  WORKER = "WORKER",
  DRIVER = "DRIVER",
}

enum Provider {
  GOOGLE = "GOOGLE",
  CREDENTIAL = "CREDENTIAL",
}

export class CreateOutletUserDTO {
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
  @IsEnum(OutletUserRole, {
    message: "Admin outlet can only create CUSTOMER or WORKER users",
  })
  readonly role?: OutletUserRole = OutletUserRole.WORKER;

  @IsNotEmpty()
  @IsNumberString()
  @Matches(/^08[0-9]{8,11}$/, {
    message: "Phone number must start with 08 and be 10-13 digits long",
  })
  readonly phoneNumber!: string;

  @IsNotEmpty()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  readonly isVerified!: boolean;

  @IsNotEmpty()
  @IsEnum(Provider)
  readonly provider!: Provider;

  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value) : undefined))
  @IsInt()
  readonly notificationId?: number;

  @IsOptional()
  @IsString()
  readonly npwp?: string;
}
