import { IsNotEmpty, IsString } from "class-validator";

export class CreatePaymentLinkDTO {
  @IsNotEmpty()
  @IsString()
  uuid!: string;
}
