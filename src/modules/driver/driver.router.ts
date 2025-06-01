import { injectable } from "tsyringe";
import { DriverController } from "./driver.controller";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { Router } from "express";

@injectable()
export class DriverRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly driverController: DriverController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {};

  getRouter(): Router {
    return this.router;
  }
}
