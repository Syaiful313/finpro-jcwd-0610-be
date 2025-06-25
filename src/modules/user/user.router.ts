import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { UserController } from "./user.controller";
import { env } from "../../config";
import { validateBody } from "../../middleware/validation.middleware";
import { UpdateUserDTO } from "./dto/updateUser.dto";
import { fileFilter, uploader } from "../../middleware/uploader.middleware";
import { CreateAddressDTO } from "./dto/createAddress.dto";
import { EditAddressDTO } from "./dto/editAddress.dto";

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
      this.userController.getUser,
    );
    this.router.patch(
      "/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET!),
      validateBody(UpdateUserDTO),
      this.userController.updateUser,
    );
    this.router.patch(
      "/photo/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET!),
      uploader().single("profilePic"),
      fileFilter,
      this.userController.uploadProfilePic,
    );
    this.router.post(
      "/address/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET!),
      validateBody(CreateAddressDTO),
      this.userController.createUserAddress,
    );
    this.router.patch(
      "/address/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET!),
      validateBody(EditAddressDTO),
      this.userController.editAddress,
    );
    this.router.delete(
      "/address/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET!),
      this.userController.deleteAddress,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
