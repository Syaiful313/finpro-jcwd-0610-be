import { IsNotEmpty, IsString } from "class-validator";

export class VerificationDTO {
  @IsNotEmpty()
  @IsString()
  readonly password!: string;
}
