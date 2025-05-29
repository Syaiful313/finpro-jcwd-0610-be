import { plainToInstance } from "class-transformer";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { GetUsersDTO } from "./dto/get-users.dto";
import { AdminService } from "./admin.service";
import { CreateUserDTO } from "./dto/create-user.dto";
import { Role } from "@prisma/client";
import { ApiError } from "../../utils/api-error";
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
      const body = req.body as CreateUserDTO;
      const currentUser = req.user as {
        id: number;
        role: string;
        outletId?: number;
      };
      const result = await this.adminService.createUser(body, profile, {
        ...currentUser,
        role: currentUser.role as Role,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const currentUser = req.user as {
        id: number;
        role: string;
        outletId?: number;
      };

      if (isNaN(userId) || userId <= 0) {
        throw new ApiError("Invalid user ID", 400);
      }

      const result = await this.adminService.deleteUser(userId, {
        ...currentUser,
        role: currentUser.role as Role,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
  // ✅ UPDATED: Update User Controller
  updateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const body: UpdateUserDTO = req.body;
      const profile = req.file; // Single file upload
      const currentUser = req.user as {
        id: number;
        role: string;
        outletId?: number;
      };

      // Validate userId parameter
      if (isNaN(userId) || userId <= 0) {
        throw new ApiError("Invalid user ID", 400);
      }

      // Call service with all required parameters
      const result = await this.adminService.updateUser(userId, body, profile, {
        ...currentUser,
        role: currentUser.role as Role,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
