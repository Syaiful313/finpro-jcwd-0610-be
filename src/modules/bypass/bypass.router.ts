import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { BypassController } from "./bypass.controller";

@autoInjectable()
export class BypassRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly bypassController: BypassController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["OUTLET_ADMIN"]),
      this.bypassController.getBypassRequests,
    );

    this.router.get(
      "/stats",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["OUTLET_ADMIN"]),
      this.bypassController.getBypassRequestStats,
    );

    this.router.get(
      "/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["OUTLET_ADMIN"]),
      this.bypassController.getBypassRequestDetail,
    );

    this.router.post(
      "/:id/approve",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["OUTLET_ADMIN"]),
      this.bypassController.approveBypassRequest,
    );

    this.router.post(
      "/:id/reject",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["OUTLET_ADMIN"]),
      this.bypassController.rejectBypassRequest,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
