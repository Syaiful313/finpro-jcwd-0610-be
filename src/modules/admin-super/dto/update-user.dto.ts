import { Provider, Role } from "@prisma/client";

export interface UpdateUserDTO {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: Role;
  phoneNumber?: string;
  isVerified?: boolean | string;
  provider?: Provider;
  notificationId?: number | null;
}

// Jika menggunakan class-validator, bisa tambahkan decorators
import {
  IsBooleanString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
} from "class-validator";

export class UpdateUserDTO {
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
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsNumberString()
  phoneNumber?: string;

  @IsOptional()
  @IsBooleanString()
  isVerified?: boolean | string;

  @IsOptional()
  @IsEnum(Provider)
  provider?: Provider;

  @IsOptional()
  @IsNumber()
  notificationId?: number | null;
}
