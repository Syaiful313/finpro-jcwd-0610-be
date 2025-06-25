import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { BypassService } from "./bypass.service";
import { GetBypassRequestsDTO } from "./dto/get-bypass-requests.dto";
import { ProcessBypassRequestDTO } from "./dto/process-bypass-request.dto";

interface AuthenticatedUser {
  id: number;
  role: string;
  outletId?: number;
  employee?: {
    id: number;
    outletId: number;
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

@injectable()
export class BypassController {
  constructor(
    private readonly bypassService: BypassService,
    private readonly prisma: PrismaService,
  ) {}

  getBypassRequests = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const query = plainToInstance(GetBypassRequestsDTO, req.query);
      const user = req.user!;

      const outletId = user.outletId;
      if (!outletId) {
        throw new ApiError("Outlet admin must have outlet assignment", 400);
      }

      const result = await this.bypassService.getBypassRequests(
        query,
        outletId,
      );

      res.status(200).json({
        success: true,
        message: "Outlet bypass requests retrieved successfully",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  getBypassRequestDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = Number(req.params.id);
      const user = req.user!;

      if (isNaN(id) || id <= 0) {
        throw new ApiError("Invalid bypass request ID", 400);
      }

      const outletId = user.outletId;
      if (!outletId) {
        throw new ApiError("Outlet admin must have outlet assignment", 400);
      }

      const result = await this.bypassService.getBypassRequestDetail(
        id,
        outletId,
      );

      res.status(200).json({
        success: true,
        message: "Bypass request details retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  approveBypassRequest = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = Number(req.params.id);
      const user = (req as any).user;

      if (isNaN(id) || id <= 0) {
        throw new ApiError("Invalid bypass request ID", 400);
      }

      const outletId = user.outletId;
      if (!outletId) {
        res.status(400).json({
          success: false,
          message: "Outlet admin must have outlet assignment",
        });
        return;
      }

      const employee = await this.prisma.employee.findFirst({
        where: {
          userId: user.id,
          outletId: outletId,
          deletedAt: null,
        },
      });

      if (!employee) {
        throw new ApiError("Employee information not found", 400);
      }

      const bodyDto = plainToInstance(ProcessBypassRequestDTO, req.body);
      const validationErrors = await validate(bodyDto);

      if (validationErrors.length > 0) {
        const errorMessages = validationErrors
          .map((error) => Object.values(error.constraints || {}).join(", "))
          .join("; ");
        throw new ApiError(`Validation failed: ${errorMessages}`, 400);
      }

      const result = await this.bypassService.approveBypassRequest(
        id,
        bodyDto,
        employee.id,
        outletId,
      );

      res.status(200).json({
        success: true,
        message: "Bypass request approved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  rejectBypassRequest = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = Number(req.params.id);
      const user = (req as any).user;

      if (isNaN(id) || id <= 0) {
        throw new ApiError("Invalid bypass request ID", 400);
      }

      const outletId = user.outletId;
      if (!outletId) {
        res.status(400).json({
          success: false,
          message: "Outlet admin must have outlet assignment",
        });
        return;
      }

      const employee = await this.prisma.employee.findFirst({
        where: {
          userId: user.id,
          outletId: outletId,
          deletedAt: null,
        },
      });

      if (!employee) {
        throw new ApiError("Employee information not found", 400);
      }

      const bodyDto = plainToInstance(ProcessBypassRequestDTO, req.body);
      const validationErrors = await validate(bodyDto);

      if (validationErrors.length > 0) {
        const errorMessages = validationErrors
          .map((error) => Object.values(error.constraints || {}).join(", "))
          .join("; ");
        throw new ApiError(`Validation failed: ${errorMessages}`, 400);
      }

      const result = await this.bypassService.rejectBypassRequest(
        id,
        bodyDto,
        employee.id,
        outletId,
      );

      res.status(200).json({
        success: true,
        message: "Bypass request rejected successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getBypassRequestStats = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const user = req.user!;

      const outletId = user.outletId;
      if (!outletId) {
        throw new ApiError("Outlet admin must have outlet assignment", 400);
      }

      const result = await this.bypassService.getBypassRequestStats(outletId);

      res.status(200).json({
        success: true,
        message: "Outlet bypass statistics retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
