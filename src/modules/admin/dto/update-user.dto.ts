import { Provider, Role } from "@prisma/client";
import {
  IsBooleanString,
  IsEmail,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";

// ✅ Interface version
export interface UpdateUserDTO {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: Role;
  phoneNumber?: string;
  isVerified?: boolean | string;
  provider?: Provider;
  outletId?: string; // ✅ Added for ADMIN to specify outlet
  npwp?: string;     // ✅ Added for employee roles
}

// ✅ Class-validator version - Enhanced
export class UpdateUserDTO {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "First name must be at least 2 characters" })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Last name must be at least 2 characters" })
  lastName?: string;

  @IsOptional()
  @IsEmail({}, { message: "Invalid email format" })
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d)/, {
    message: "Password must contain both letters and numbers"
  })
  password?: string;

  @IsOptional()
  @IsEnum(Role, { message: "Invalid role" })
  role?: Role;

  @IsOptional()
  @IsString()
  @Matches(/^08[0-9]{8,11}$/, {
    message: "Phone number must be in format 08xxxxxxxxxx (10-13 digits)"
  })
  phoneNumber?: string;

  @IsOptional()
  @IsBooleanString({ message: "isVerified must be boolean" })
  isVerified?: boolean | string;

  @IsOptional()
  @IsEnum(Provider, { message: "Invalid provider" })
  provider?: Provider;

  // ✅ New fields for employee roles
  @IsOptional()
  @IsNumberString({}, { message: "Outlet ID must be a number" })
  outletId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{15}$/, {
    message: "NPWP must be exactly 15 digits"
  })
  npwp?: string;
}