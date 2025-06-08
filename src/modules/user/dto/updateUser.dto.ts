import { IsEmail, IsOptional, IsPhoneNumber, IsString } from "class-validator";

export class UpdateUserDTO {
  @IsOptional()
  @IsEmail()
  readonly email?: string;

  @IsOptional()
  @IsString()
  readonly firstName?: string;

  @IsOptional()
  @IsString()
  readonly lastName?: string;

  @IsOptional()
  @IsPhoneNumber("ID")
  readonly phoneNumber?: string;
}
