import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CompletePickupDto {
  @IsOptional()
  @IsString()
  readonly notes?: string;
}

export class CompleteDeliveryDto {
  @IsOptional()
  @IsString()
  readonly notes?: string;
}
