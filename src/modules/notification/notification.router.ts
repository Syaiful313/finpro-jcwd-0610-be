import { injectable } from "tsyringe";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { Router } from "express";
import { NotificationController } from "./notification.controller";
import { env } from "../../config";
import { verifyRole } from "../../middleware/role.middleware";

@injectable()
export class NotificationRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly notificationController: NotificationController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/driver",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.notificationController.getDriverNotifications,
    );
    this.router.get(
      "/user",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      this.notificationController.getUserNotifications,
    );
  };
  getRouter(): Router {
    return this.router;
  }
}
