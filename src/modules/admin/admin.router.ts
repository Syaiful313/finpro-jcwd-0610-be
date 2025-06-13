import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { uploader } from "../../middleware/uploader.middleware";
import { AdminController } from "./admin.controller";

@autoInjectable()
export class AdminRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly adminController: AdminController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/users",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN", "OUTLET_ADMIN"]),
      this.adminController.getUsers,
    );
    this.router.post(
      "/users",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN"]),
      uploader().fields([{ name: "profile", maxCount: 1 }]),
      this.adminController.createUser,
    );
    this.router.patch(
      "/users/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN"]),
      uploader().single("profile"),
      this.adminController.updateUser,
    );
    this.router.delete(
      "/users/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN"]),
      this.adminController.deleteUser,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
