import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
} from "class-validator";

export class EditAddressDTO {
  @IsNotEmpty()
  @IsNumber()
  addressId!: number;

  @IsNotEmpty()
  @IsString()
  addressName!: string;

  @IsNotEmpty()
  @IsString()
  addressLine!: string;

  @IsNotEmpty()
  @IsString()
  district!: string;

  @IsNotEmpty()
  @IsString()
  city!: string;

  @IsNotEmpty()
  @IsString()
  province!: string;

  @IsNotEmpty()
  @IsBoolean()
  isPrimary!: boolean;

  @IsNotEmpty()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: "Latitude must be a valid number" })
  readonly latitude!: number;

  @IsNotEmpty()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: "Longitude must be a valid number" })
  readonly longitude!: number;

  @IsNotEmpty()
  @IsString()
  postalCode!: string;
}
