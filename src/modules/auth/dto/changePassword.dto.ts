import { IsNotEmpty, IsString } from "class-validator";

export class ChangePasswordDTO {
  @IsNotEmpty()
  @IsString()
  readonly oldPassword!: string;

  @IsNotEmpty()
  @IsString()
  readonly newPassword!: string;
}
