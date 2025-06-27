import { plainToInstance } from "class-transformer";
import { IsNotEmpty, IsNumber, IsString, validateSync } from "class-validator";

class EnvConfig {
  @IsNotEmpty()
  @IsNumber()
  readonly PORT!: number;

  @IsNotEmpty()
  @IsString()
  readonly DATABASE_URL!: string;

  @IsNotEmpty()
  @IsString()
  readonly JWT_SECRET!: string;

  @IsNotEmpty()
  @IsString()
  readonly JWT_SECRET_KEY_RESET_PASSWORD!: string;

  @IsNotEmpty()
  @IsString()
  readonly JWT_SECRET_KEY_VERIFICATION!: string;

  @IsNotEmpty()
  @IsString()
  readonly MAIL_USER!: string;

  @IsNotEmpty()
  @IsString()
  readonly MAIL_PASSWORD!: string;

  @IsNotEmpty()
  @IsString()
  readonly CLOUDINARY_CLOUD_NAME!: string;

  @IsNotEmpty()
  @IsString()
  readonly CLOUDINARY_API_KEY!: string;

  @IsNotEmpty()
  @IsString()
  readonly CLOUDINARY_API_SECRET!: string;
}

export const env = () => {
  const envConfig = plainToInstance(EnvConfig, process.env, {
    enableImplicitConversion: true, 
  });

  const errors = validateSync(envConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Environment validation error: ${errors
        .map((err) => Object.values(err.constraints || {}).join(", "))
        .join("; ")}`,
    );
  }

  return envConfig;
};
