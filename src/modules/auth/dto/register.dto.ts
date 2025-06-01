import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class RegisterDTO {
  @IsNotEmpty()
  @IsString()
  readonly firstName!: string;

  @IsNotEmpty()
  @IsString()
  readonly lastName!: string;

  @IsNotEmpty()
  @IsString()
  readonly email!: string;

  @IsOptional()
  @IsString()
  readonly phoneNumber?: string;
}
