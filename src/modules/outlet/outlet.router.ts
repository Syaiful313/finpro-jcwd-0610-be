import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { OutletController } from "./outlet.controller";

@autoInjectable()
export class OutletRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly outletController: OutletController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN", "OUTLET_ADMIN"]),
      this.outletController.getOutlets,
    );
    this.router.post(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN"]),
      this.outletController.createOutlet,
    );
    this.router.patch(
      "/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN"]),
      this.outletController.updateOutlet,
    );
    this.router.delete(
      "/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN"]),
      this.outletController.deleteOutlet,
    );
  }

  getRouter(): Router {
    return this.router;
  }
}
