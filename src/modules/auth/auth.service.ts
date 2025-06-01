import { injectable } from "tsyringe";
import { env } from "../../config";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { prismaExclude } from "../prisma/utils";
import { LoginDTO } from "./dto/login.dto";
import { RegisterDTO } from "./dto/register.dto";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { MailService } from "../mail/mail.service";
import { VerificationDTO } from "./dto/verification.dto";
import { ResendEmailDTO } from "./dto/resendEmail.dto";

@injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
  ) {}

  login = async (body: LoginDTO) => {
    const { email, password } = body;

    const existingUser = await this.prisma.user.findFirst({
      where: { email },
    });

    if (!existingUser) {
      throw new ApiError("User not found", 404);
    }

    if (!existingUser.password) {
      throw new ApiError("User is not verified", 400);
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
    const { firstName, lastName, email, phoneNumber } = body;
    const existingUser = await this.prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      throw new ApiError("Email already exist", 400);
    }

    const newUser = await this.prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        phoneNumber,
        isVerified: false,
      },
      select: prismaExclude("User", ["password"]),
    });

    const verificationPayload = { userId: newUser.id, email: newUser.email };
    const emailVerificationToken = this.tokenService.generateToken(
      verificationPayload,
      process.env.JWT_SECRET as string,
      { expiresIn: "1h" },
    );

    await this.prisma.user.update({
      where: { id: newUser.id },
      data: {
        emailVerificationToken: emailVerificationToken,
      },
    });

    const verificationLink = `${process.env.FRONTEND_URL}/register/set-password?token=${emailVerificationToken}`;
    await this.mailService.sendVerificationEmail(
      newUser.email,
      verificationLink,
    );

    return newUser;
  };

  verifyEmailAndSetPassword = async (body: VerificationDTO) => {
    const { token, password } = body;
    let decoded: any;
    try {
      decoded = this.tokenService.verifyToken(
        token,
        process.env.JWT_SECRET as string,
      );
    } catch (err) {
      throw new ApiError("Invalid or expired verification token", 400);
    }

    const userId = decoded.userId;
    const userEmail = decoded.email;
    const user = await this.prisma.user.findUnique({
      where: { id: userId, email: userEmail },
    });

    if (
      !user ||
      user.isVerified ||
      !user.emailVerificationToken ||
      user.emailVerificationToken !== token
    ) {
      throw new ApiError("Invalid or already verified user/token", 400);
    }

    const hashedPassword = await this.passwordService.hashPassword(password);
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        isVerified: true,
        emailVerificationToken: null,
      },
      select: prismaExclude("User", ["password"]),
    });

    return updatedUser;
  };

  resendEmailVerification = async (body: ResendEmailDTO) => {
    const { email } = body;
    const existingUser = await this.prisma.user.findFirst({
      where: { email },
    });

    if (!existingUser) {
      throw new ApiError("Email is not registered", 400);
    }

    const verificationPayload = {
      userId: existingUser.id,
      email: existingUser.email,
    };
    const emailVerificationToken = this.tokenService.generateToken(
      verificationPayload,
      process.env.JWT_SECRET as string,
      { expiresIn: "1h" },
    );

    await this.prisma.user.update({
      where: { id: existingUser.id },
      data: {
        emailVerificationToken: emailVerificationToken,
      },
    });

    const verificationLink = `${process.env.FRONTEND_URL}/register/set-password?token=${emailVerificationToken}`;
    await this.mailService.sendVerificationEmail(
      existingUser.email,
      verificationLink,
    );

    return existingUser;
  };
}
