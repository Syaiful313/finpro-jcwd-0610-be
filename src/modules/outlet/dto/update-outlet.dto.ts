import { Transform } from "class-transformer";
import {
  IsBooleanString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";

// ✅ Interface version
export interface UpdateOutletDTO {
  outletName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  serviceRadius?: number;
  isActive?: boolean | string;
}

// ✅ Class-validator version - Enhanced
export class UpdateOutletDTO {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Outlet name must be at least 2 characters" })
  outletName?: string;

  @IsOptional()
  @IsString()
  @MinLength(10, { message: "Address must be at least 10 characters" })
  address?: string;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: "Latitude must be a valid number" })
  @Min(-90, { message: "Latitude must be between -90 and 90" })
  @Max(90, { message: "Latitude must be between -90 and 90" })
  latitude?: number;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: "Longitude must be a valid number" })
  @Min(-180, { message: "Longitude must be between -180 and 180" })
  @Max(180, { message: "Longitude must be between -180 and 180" })
  longitude?: number;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: "Service radius must be a valid number" })
  @Min(0.1, { message: "Service radius must be at least 0.1 kilometers" })
  @Max(50, { message: "Service radius must not exceed 50 kilometers" })
  serviceRadius?: number;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBooleanString({ message: "isActive must be boolean" })
  isActive?: boolean | string;
}
