import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { LaundryItemController } from "./laundry-item.controller";

@autoInjectable()
export class LaundryItemRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly laundryItemController: LaundryItemController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN"]),
      this.laundryItemController.getLaundryItems,
    );
    this.router.post(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN"]),
      this.laundryItemController.createLaundryItem,
    );
    this.router.patch(
      "/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN"]),
      this.laundryItemController.updateLaundryItem,
    );
    this.router.delete(
      "/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN"]),
      this.laundryItemController.deleteLaundryItem,
    );
  }

  getRouter(): Router {
    return this.router;
  }
}
