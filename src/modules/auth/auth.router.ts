import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { validateBody } from "../../middleware/validation.middleware";
import { AuthController } from "./auth.controller";
import { LoginDTO } from "./dto/login.dto";
import { RegisterDTO } from "./dto/register.dto";
import { VerificationDTO } from "./dto/verification.dto";
import { ResendEmailDTO } from "./dto/resendEmail.dto";

@autoInjectable()
export class AuthRouter {
  private readonly router: Router = Router();

  constructor(private readonly authController: AuthController) {
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
      validateBody(VerificationDTO),
      this.authController.verifyEmailAndSetPassword,
    );
    this.router.post(
      "/resend-verification",
      validateBody(ResendEmailDTO),
      this.authController.resendEmailVerification,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
