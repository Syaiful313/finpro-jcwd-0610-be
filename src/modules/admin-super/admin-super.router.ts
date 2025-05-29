// import { Router } from "express";
// import { autoInjectable } from "tsyringe";
// import { fileFilter, uploader } from "../../middleware/uploader.middleware";
// import { validateBody } from "../../middleware/validation.middleware";
// import { AdminSuperController } from "./admin-super.controller";
// import { CreateUserDTO } from "./dto/create-user.dto";

// @autoInjectable()
// export class AdminSuperRouter {
//   private readonly router: Router = Router();

//   constructor(private readonly adminSuperController: AdminSuperController) {
//     this.initializeRoutes();
//   }

//   private initializeRoutes = (): void => {
//     this.router.get("/", this.adminSuperController.getUsers);
//     this.router.post(
//       "/",
//       uploader().fields([{ name: "profile", maxCount: 1 }]),
//       fileFilter,
//       validateBody(CreateUserDTO),
//       this.adminSuperController.createUser,
//     );
//     this.router.patch(
//       "/:id",
//       uploader().single("profile"),
//       fileFilter,
//       this.adminSuperController.UpdateUser,
//     );
//     this.router.delete("/:id", this.adminSuperController.deleteUser);
//   };

//   getRouter(): Router {
//     return this.router;
//   }
// }
