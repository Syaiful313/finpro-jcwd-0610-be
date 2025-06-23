import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { AdminService } from "./admin.service";
import { CreateUserDTO } from "./dto/create-user.dto";
import { GetUsersDTO } from "./dto/get-users.dto";
import { UpdateUserDTO } from "./dto/update-user.dto";

@injectable()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  getUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = plainToInstance(GetUsersDTO, req.query);
      const user = (req as any).user;

      let result;

      if (user.role === "ADMIN") {
        result = await this.adminService.getUsers(query);
      } else if (user.role === "OUTLET_ADMIN") {
        const outletId = user.outletId;

        if (!outletId) {
          res.status(400).json({
            success: false,
            message: "OUTLET_ADMIN must have outlet assignment",
          });
          return;
        }

        result = await this.adminService.getUsers(query, outletId);
      } else {
        res.status(403).json({
          success: false,
          message:
            "Unauthorized role. Only ADMIN and OUTLET_ADMIN can access this endpoint",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Users retrieved successfully",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  createUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const profile = files.profile?.[0];
      const bodyDto = plainToInstance(CreateUserDTO, req.body);
      const validationErrors = await validate(bodyDto);

      if (validationErrors.length > 0) {
        const errorMessages = validationErrors
          .map((error) => Object.values(error.constraints || {}).join(", "))
          .join("; ");
        throw new ApiError(`Validation failed: ${errorMessages}`, 400);
      }

      const result = await this.adminService.createUser(bodyDto, profile);

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);

      if (isNaN(userId) || userId <= 0) {
        throw new ApiError("Invalid user ID", 400);
      }

      const result = await this.adminService.deleteUser(userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const body: UpdateUserDTO = req.body;
      const profile = req.file;

      if (isNaN(userId) || userId <= 0) {
        throw new ApiError("Invalid user ID", 400);
      }

      const result = await this.adminService.updateUser(userId, body, profile);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
