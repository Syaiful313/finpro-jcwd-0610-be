import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { validateBody } from "../../middleware/validation.middleware";
import { AuthController } from "./auth.controller";
import { LoginDTO } from "./dto/login.dto";
import { RegisterDTO } from "./dto/register.dto";
import { VerificationDTO } from "./dto/verification.dto";
import { GoogleAuthDTO } from "./dto/googleAuth.dto";
import { ForgotPasswordDTO } from "./dto/forgotPassword.dto";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { ResetPasswordDTO } from "./dto/resetPassword.dto";
import { ChangePasswordDTO } from "./dto/changePassword.dto";

@autoInjectable()
export class AuthRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly authController: AuthController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.post(
      "/login",
      validateBody(LoginDTO),
      this.authController.login,
    );
    this.router.post(
      "/register",
      validateBody(RegisterDTO),
      this.authController.register,
    );
    this.router.post(
      "/verify-email-and-set-password",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET_KEY_VERIFICATION),
      validateBody(VerificationDTO),
      this.authController.verifyEmailAndSetPassword,
    );
    this.router.post(
      "/google",
      validateBody(GoogleAuthDTO),
      this.authController.googleAuth,
    );
    this.router.post(
      "/forgot-password",
      validateBody(ForgotPasswordDTO),
      this.authController.forgotPassword,
    );
    this.router.post(
      "/reset-password",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET_KEY_RESET_PASSWORD),
      validateBody(ResetPasswordDTO),
      this.authController.resetPassword,
    );
    this.router.post(
      "/reverify",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      validateBody(ForgotPasswordDTO),
      this.authController.resendEmailVerif,
    );
    this.router.post(
      "/verify-email",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET_KEY_VERIFICATION),
      this.authController.verifyEmail,
    );
    this.router.patch(
      "/password",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      validateBody(ChangePasswordDTO),
      this.authController.changePassword,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
