import { IsNotEmpty, IsString } from "class-validator";

export class ResendEmailDTO {
  @IsNotEmpty()
  @IsString()
  readonly email!: string;
}
