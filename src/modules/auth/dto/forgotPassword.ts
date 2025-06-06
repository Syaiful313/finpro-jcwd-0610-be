import { IsNotEmpty, IsString } from "class-validator";

export class ForgotPasswordDTO {
  @IsNotEmpty()
  @IsString()
  readonly email!: string;
}
