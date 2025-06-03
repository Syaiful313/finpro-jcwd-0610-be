import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { PricingType } from "@prisma/client";

export class CreateLaundryItemDTO {
  @IsNotEmpty()
  @IsString()
  @MinLength(2, { message: "Nama item minimal 2 karakter" })
  @MaxLength(100, { message: "Nama item maksimal 100 karakter" })
  readonly name!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(2, { message: "Kategori minimal 2 karakter" })
  @MaxLength(50, { message: "Kategori maksimal 50 karakter" })
  readonly category!: string;

  @IsNotEmpty()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: "Harga harus berupa angka yang valid" })
  @Min(0, { message: "Harga tidak boleh negatif" })
  readonly basePrice!: number;

  @IsNotEmpty()
  @IsEnum(PricingType, {
    message: "Tipe pricing harus PER_PIECE atau PER_KG",
  })
  readonly pricingType!: PricingType;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  readonly isActive?: boolean = true;
}
