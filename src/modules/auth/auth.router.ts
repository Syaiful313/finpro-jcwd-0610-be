import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { validateBody } from "../../middleware/validation.middleware";
import { AuthController } from "./auth.controller";
import { LoginDTO } from "./dto/login.dto";
import { RegisterDTO } from "./dto/register.dto";
import { VerificationDTO } from "./dto/verification.dto";
import { GoogleAuthDTO } from "./dto/googleAuth";
import { ForgotPasswordDTO } from "./dto/forgotPassword";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { ResetPasswordDTO } from "./dto/resetPassword";

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
  };

  getRouter(): Router {
    return this.router;
  }
}
