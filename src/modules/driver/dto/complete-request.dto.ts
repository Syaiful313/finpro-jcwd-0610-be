import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CompletePickupDto {
  // @IsNotEmpty()
  // readonly pickUpPhotos!: any;

  @IsOptional()
  @IsString()
  readonly notes?: string;
}

export class CompleteDeliveryDto {
  @IsOptional()
  @IsString()
  readonly notes?: string;
}
