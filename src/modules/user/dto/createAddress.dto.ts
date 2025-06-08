import { IsNotEmpty, IsString } from "class-validator";

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
  @IsString()
  postalCode!: string;
}
