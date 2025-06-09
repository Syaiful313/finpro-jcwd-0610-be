import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { UserController } from "./user.controller";
import { env } from "../../config";
import { validateBody } from "../../middleware/validation.middleware";
import { UpdateUserDTO } from "./dto/updateUser.dto";

@autoInjectable()
export class UserRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly userController: UserController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET!),
      this.userController.getUser,
    );
    this.router.patch(
      "/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET!),
      validateBody(UpdateUserDTO),
      this.userController.updateUser,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
