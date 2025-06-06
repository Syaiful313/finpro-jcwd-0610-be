import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { AuthService } from "./auth.service";
import { LoginDTO } from "./dto/login.dto";
import { RegisterDTO } from "./dto/register.dto";
import { VerificationDTO } from "./dto/verification.dto";
import { GoogleAuthDTO } from "./dto/googleAuth";
import { ForgotPasswordDTO } from "./dto/forgotPassword";
import { ResetPasswordDTO } from "./dto/resetPassword";

@injectable()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as LoginDTO;
      const result = await this.authService.login(body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as RegisterDTO;
      const result = await this.authService.register(body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  verifyEmailAndSetPassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user!.id;
      console.log("Auth User ID", authUserId);
      const body = req.body as VerificationDTO;
      const result = await this.authService.verifyEmailAndSetPassword(
        body,
        authUserId,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  googleAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as GoogleAuthDTO;
      const result = await this.authService.googleAuth(body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as ForgotPasswordDTO;
      const result = await this.authService.forgotPassword(body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user!.id;
      const body = req.body as ResetPasswordDTO;
      const result = await this.authService.resetPassword(body, authUserId);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
