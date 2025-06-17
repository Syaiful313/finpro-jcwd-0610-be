import { IsNotEmpty, IsString, ValidateNested } from "class-validator";

export class UpdatePaymentDTO {
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsNotEmpty()
  @IsString()
  status!: string;

  @IsString()
  paid_at?: string;
}