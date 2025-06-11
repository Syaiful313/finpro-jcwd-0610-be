import { Transform } from "class-transformer";
import { IsNotEmpty, IsNumber, IsString, Max, Min } from "class-validator";

export class CreateAddressDTO {
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
