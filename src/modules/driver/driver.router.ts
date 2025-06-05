import { autoInjectable, injectable } from "tsyringe";
import { DriverController } from "./driver.controller";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { Router } from "express";
import { verifyRole } from "../../middleware/role.middleware";
import { env } from "../../config";

@autoInjectable()
export class DriverRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly driverController: DriverController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.getAvailableRequests,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
