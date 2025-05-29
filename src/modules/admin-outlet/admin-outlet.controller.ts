// import { plainToInstance } from "class-transformer";
// import { NextFunction, Request, Response } from "express";
// import { injectable } from "tsyringe";
// import { GetOutletUsersDTO } from "./dto/get-outlet-user.dto";
// import { AdminOutletUserService } from "./admin-outlet.service";
// import { CreateOutletUserDTO } from "./dto/create-outlet-user.dto";

// @injectable()
// export class AdminOutletController {
//   constructor(
//     private readonly adminOutletUserService: AdminOutletUserService,
//   ) {}

//   getOutletUsers = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const outletId = parseInt(req.params.outletId);
//       const query = plainToInstance(GetOutletUsersDTO, req.query);
//       const result = await this.adminOutletUserService.getOutletUsers(
//         outletId,
//         query,
//       );
//       res.status(200).send(result);
//     } catch (error) {
//       next(error);
//     }
//   };

//   createOutletUser = async (
//     req: Request,
//     res: Response,
//     next: NextFunction,
//   ) => {
//     try {
//       const { outletId } = req.params;
//       const files = req.files as { [fieldname: string]: Express.Multer.File[] };
//       const profile = files.profile?.[0];
//       const body = req.body as CreateOutletUserDTO;
//       const result = await this.adminOutletUserService.createOutletUser(
//         Number(outletId),
//         body,
//         profile,
//       );
//       res.status(201).send(result);
//     } catch (error) {
//       next(error);
//     }
//   };
// }
