import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class CreateOutletDTO {
  @IsNotEmpty()
  @IsString()
  readonly outletName!: string;

  @IsNotEmpty()
  @IsString()
  readonly address!: string;

  @IsNotEmpty()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: "Latitude must be a valid number" })
  @Min(-90, { message: "Latitude must be between -90 and 90" })
  @Max(90, { message: "Latitude must be between -90 and 90" })
  readonly latitude!: number;

  @IsNotEmpty()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: "Longitude must be a valid number" })
  @Min(-180, { message: "Longitude must be between -180 and 180" })
  @Max(180, { message: "Longitude must be between -180 and 180" })
  readonly longitude!: number;

  @IsNotEmpty()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: "Service radius must be a valid number" })
  @Min(0.1, { message: "Service radius must be at least 0.1 kilometers" })
  @Max(50, { message: "Service radius must not exceed 50 kilometers" })
  readonly serviceRadius!: number;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  readonly isActive?: boolean = true;
}
