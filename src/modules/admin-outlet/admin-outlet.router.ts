// import { Router } from "express";
// import { autoInjectable } from "tsyringe";
// import { JwtMiddleware } from "../../middleware/jwt.middleware";
// import { AdminOutletController } from "./admin-outlet.controller";
// import { fileFilter, uploader } from "../../middleware/uploader.middleware";
// import { validateBody } from "../../middleware/validation.middleware";
// import { CreateOutletUserDTO } from "./dto/create-outlet-user.dto";

// @autoInjectable()
// export class AdminOutletRouter {
//   private readonly router: Router = Router();

//   constructor(
//     private readonly adminOutletController: AdminOutletController,
//     private readonly jwtMiddleware: JwtMiddleware,
//   ) {
//     this.initializeRoutes();
//   }

//   private initializeRoutes = (): void => {
//     this.router.get("/:outletId", this.adminOutletController.getOutletUsers);
//     this.router.post(
//       "/:outletId",
//       uploader().fields([{ name: "profile", maxCount: 1 }]),
//       fileFilter,
//       validateBody(CreateOutletUserDTO),
//       this.adminOutletController.createOutletUser,
//     );
//   };

//   getRouter(): Router {
//     return this.router;
//   }
// }
