// import { plainToInstance } from "class-transformer";
// import { NextFunction, Request, Response } from "express";
// import { injectable } from "tsyringe";
// import { ApiError } from "../../utils/api-error";
// import { AdminSuperService } from "./admin-super.service";
// import { CreateUserDTO } from "./dto/create-user.dto";
// import { GetUsersDTO } from "./dto/get-users.dto";
// import { UpdateUserDTO } from "./dto/update-user.dto";

// @injectable()
// export class AdminSuperController {
//   constructor(private readonly adminSuperService: AdminSuperService) {}

//   getUsers = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const query = plainToInstance(GetUsersDTO, req.query);
//       const result = await this.adminSuperService.getUsers(query);
//       res.status(200).send(result);
//     } catch (error) {
//       next(error);
//     }
//   };

//   createUser = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const files = req.files as { [fieldname: string]: Express.Multer.File[] };

//       const profile = files.profile?.[0];

//       const body = req.body as CreateUserDTO;
//       const result = await this.adminSuperService.createUser(body, profile);
//       res.status(200).send(result);
//     } catch (error) {
//       next(error);
//     }
//   };

//   deleteUser = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const id = Number(req.params.id);
//       const result = await this.adminSuperService.deleteUser(id);
//       res.status(200).send(result);
//     } catch (error) {
//       next(error);
//     }
//   };
//   UpdateUser = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const userId = parseInt(req.params.id);
//       const body: UpdateUserDTO = req.body;
//       const profile = req.file;

//       if (isNaN(userId)) {
//         throw new ApiError("Invalid user ID", 400);
//       }

//       const result = await this.adminSuperService.updateUser(
//         userId,
//         body,
//         profile,
//       );

//       res.status(200).json(result);
//     } catch (error) {
//       next(error);
//     }
//   };
// }
