import { Type } from "class-transformer";
import { IsDate, IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreatePickupOrderDTO {
  @IsNotEmpty()
  @IsNumber()
  addressId!: number;

  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  scheduledPickupTime!: Date;
}
