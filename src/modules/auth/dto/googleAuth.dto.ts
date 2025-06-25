import { IsNotEmpty, IsString } from "class-validator";

export class GoogleAuthDTO {
  @IsNotEmpty()
  @IsString()
  readonly tokenId!: string;
}
