// dto/process-bypass-request.dto.ts
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class ProcessBypassRequestDTO {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500, { message: "Admin note must not exceed 500 characters" })
  readonly adminNote!: string;
}