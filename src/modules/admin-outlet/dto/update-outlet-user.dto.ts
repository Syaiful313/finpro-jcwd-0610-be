import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

enum OutletUserRole {
  WORKER = "WORKER",
  DRIVER = "DRIVER",
}

enum Provider {
  GOOGLE = "GOOGLE",
  CREDENTIAL = "CREDENTIAL",
}

export class UpdateOutletUserDTO {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsEnum(OutletUserRole, {
    message: "Admin outlet can only set role to CUSTOMER or WORKER",
  })
  role?: OutletUserRole;

  @IsOptional()
  @IsNumberString()
  @Matches(/^08[0-9]{8,11}$/, {
    message: "Phone number must start with 08 and be 10-13 digits long",
  })
  phoneNumber?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === "string") {
      return value === "true";
    }
    return value;
  })
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsEnum(Provider)
  provider?: Provider;

  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value) : null))
  @IsNumber()
  notificationId?: number | null;

  @IsOptional()
  @IsString()
  readonly npwp?: string;
}
