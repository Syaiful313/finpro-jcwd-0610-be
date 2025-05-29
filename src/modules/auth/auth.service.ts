import { injectable } from "tsyringe";
import { env } from "../../config";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { prismaExclude } from "../prisma/utils";
import { LoginDTO } from "./dto/login.dto";
import { RegisterDTO } from "./dto/register.dto";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

@injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  login = async (body: LoginDTO) => {
    const { email, password } = body;

    const existingUser = await this.prisma.user.findFirst({
      where: { email },
    });

    if (!existingUser) {
      throw new ApiError("User not found", 404);
    }

    const isPasswordValid = await this.passwordService.comparePassword(
      password,
      existingUser.password,
    );

    if (!isPasswordValid) {
      throw new ApiError("Invalid credentials", 400);
    }

    let outletId: number | undefined;

    if (existingUser.role === "OUTLET_ADMIN") {
      const employee = await this.prisma.employee.findFirst({
        where: {
          userId: existingUser.id,
        },
        select: { outletId: true },
      });

      outletId = employee?.outletId;
    }

    const tokenPayload: any = {
      id: existingUser.id,
      role: existingUser.role,
    };

    if (outletId) {
      tokenPayload.outletId = outletId;
    }

    const accessToken = this.tokenService.generateToken(
      tokenPayload,
      env().JWT_SECRET,
    );

    const { password: pw, ...userWithoutPassword } = existingUser;

    return {
      ...userWithoutPassword,
      accessToken,
      ...(outletId && { outletId }),
    };
  };

  register = async (body: RegisterDTO) => {
    const { firstName, lastName, email, password } = body;

    const existingUser = await this.prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      throw new ApiError("Email already exist", 400);
    }

    const hashedPassword = await this.passwordService.hashPassword(password);

    return await this.prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword,
      },
      select: prismaExclude("User", ["password"]),
    });
  };
}
