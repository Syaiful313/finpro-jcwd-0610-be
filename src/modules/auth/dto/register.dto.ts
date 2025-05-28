import { IsNotEmpty, IsString } from "class-validator";

export class RegisterDTO {
  @IsNotEmpty()
  @IsString()
  readonly email!: string;

  @IsNotEmpty()
  @IsString()
  readonly password!: string;

  @IsNotEmpty()
  @IsString()
  readonly firstName!: string;

  @IsNotEmpty()
  @IsString()
  readonly lastName!: string;
}
