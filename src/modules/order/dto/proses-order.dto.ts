import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class OrderItemDetailDTO {
  @IsNotEmpty()
  @IsString()
  readonly name!: string;

  @IsNotEmpty()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1, { message: "Quantity harus minimal 1" })
  readonly qty!: number;
}

export class ProcessOrderItemDTO {
  @IsNotEmpty()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  readonly laundryItemId!: number;

  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value) : undefined))
  @IsInt()
  @Min(1, { message: "Quantity harus minimal 1" })
  readonly quantity?: number;

  @IsOptional()
  @Transform(({ value }) => (value ? parseFloat(value) : undefined))
  @IsNumber({}, { message: "Weight harus berupa angka" })
  @IsPositive({ message: "Weight harus lebih dari 0" })
  readonly weight?: number;

  @IsOptional()
  @IsString()
  readonly color?: string;

  @IsOptional()
  @IsString()
  readonly brand?: string;

  @IsOptional()
  @IsString()
  readonly materials?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDetailDTO)
  readonly orderItemDetails?: OrderItemDetailDTO[];
}

export class ProcessOrderDTO {
  @IsNotEmpty()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: "Total weight harus berupa angka" })
  @IsPositive({ message: "Total weight harus lebih dari 0" })
  readonly totalWeight!: number;

  @IsNotEmpty()
  @IsArray({ message: "Order items harus berupa array" })
  @ValidateNested({ each: true })
  @Type(() => ProcessOrderItemDTO)
  readonly orderItems!: ProcessOrderItemDTO[];
}
