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
import { GoogleAuthDTO } from "./dto/googleAuth";
import { auth, OAuth2Client } from "google-auth-library";
import { ForgotPasswordDTO } from "./dto/forgotPassword";
import { ResetPasswordDTO } from "./dto/resetPassword";

@injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
  ) {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new Error("Missing GOOGLE_CLIENT_ID env variable");
    }
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

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

    const verificationPayload = { id: newUser.id, email: newUser.email };
    const emailVerificationToken = this.tokenService.generateToken(
      verificationPayload,
      process.env.JWT_SECRET_KEY_VERIFICATION as string,
      { expiresIn: "15m" },
    );

    const verificationLink = `${process.env.FRONTEND_URL}/register/set-password?token=${emailVerificationToken}`;
    await this.mailService.sendVerificationEmail(
      newUser.email,
      verificationLink,
    );

    return newUser;
  };

  verifyEmailAndSetPassword = async (
    body: VerificationDTO,
    authUserId: number,
  ) => {
    const { password } = body;
    const existingUser = await this.prisma.user.findUnique({
      where: { id: authUserId },
    });

    if (!existingUser || existingUser.isVerified) {
      throw new ApiError("Invalid or already verified user/token", 400);
    }

    const hashedPassword = await this.passwordService.hashPassword(password);
    const updatedUser = await this.prisma.user.update({
      where: { id: authUserId },
      data: {
        password: hashedPassword,
        isVerified: true,
      },
      select: prismaExclude("User", ["password"]),
    });

    return updatedUser;
  };

  googleAuth = async (body: GoogleAuthDTO) => {
    const { tokenId } = body;
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    const ticket = await this.googleClient.verifyIdToken({
      idToken: tokenId,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (
      !payload ||
      !payload.email ||
      !payload.name ||
      !payload.email_verified
    ) {
      throw new Error("Google account not verified.");
    }

    const { email, name, picture } = payload;

    const [firstName, ...lastNameParts] = name.split(" ");
    const lastName = lastNameParts.join(" ") || "";

    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          firstName,
          lastName,
          profilePic: picture,
          provider: "GOOGLE",
        },
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("Missing JWT_SECRET env variable");
    }
    const token = this.tokenService.generateToken(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );

    return { user, token };
  };

  forgotPassword = async (body: ForgotPasswordDTO) => {
    const { email } = body;
    const existingUser = await this.prisma.user.findFirst({
      where: { email },
    });
    if (!existingUser) {
      throw new ApiError("Email is not registered", 400);
    }
    if (existingUser.isVerified === false) {
      throw new ApiError("Please verify your email", 400);
    }

    const forgotPasswordPayload = {
      userId: existingUser.id,
      email: existingUser.email,
    };
    const resetPasswordToken = this.tokenService.generateToken(
      forgotPasswordPayload,
      process.env.JWT_SECRET_KEY_RESET_PASSWORD as string,
      { expiresIn: "15m" },
    );

    const resetPasswordLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetPasswordToken}`;
    await this.mailService.sendResetPasswordEmail(
      existingUser.email,
      resetPasswordLink,
      existingUser.firstName,
    );

    return existingUser;
  };

  resetPassword = async (body: ResetPasswordDTO, authUserId: number) => {
    const { newPassword } = body;
    const existingUser = await this.prisma.user.findFirst({
      where: { id: authUserId },
    });
    if (!existingUser) {
      throw new ApiError("User is not registered", 400);
    }

    const hashedPassword = await this.passwordService.hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: existingUser.id },
      data: { password: hashedPassword },
    });

    return {
      message: "Password reset successfully",
    };
  };
}
