// src/controllers/bypassController.ts
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { BypassService } from "./bypass.service";
import { GetBypassRequestsDTO } from "./dto/get-bypass-requests.dto";
import { ProcessBypassRequestDTO } from "./dto/process-bypass-request.dto";

@injectable()
export class BypassController {
  constructor(private readonly bypassService: BypassService) {}

  getBypassRequests = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const query = plainToInstance(GetBypassRequestsDTO, req.query);
      const user = (req as any).user;

      // CRITICAL: Only OUTLET_ADMIN can access bypass requests
      if (user.role !== "OUTLET_ADMIN") {
        res.status(403).json({
          success: false,
          message:
            "Access denied. Only outlet admins can manage bypass requests.",
        });
        return;
      }

      // CRITICAL: Must have outlet assignment
      const outletId = user.outletId;
      if (!outletId) {
        res.status(400).json({
          success: false,
          message: "Outlet admin must have outlet assignment",
        });
        return;
      }

      // Get bypass requests for this outlet only
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
      const user = (req as any).user;

      if (isNaN(id) || id <= 0) {
        throw new ApiError("Invalid bypass request ID", 400);
      }

      // CRITICAL: Only OUTLET_ADMIN can access bypass requests
      if (user.role !== "OUTLET_ADMIN") {
        res.status(403).json({
          success: false,
          message:
            "Access denied. Only outlet admins can view bypass requests.",
        });
        return;
      }

      // CRITICAL: Must have outlet assignment
      const outletId = user.outletId;
      if (!outletId) {
        res.status(400).json({
          success: false,
          message: "Outlet admin must have outlet assignment",
        });
        return;
      }

      // Get bypass request detail for this outlet only
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

      // CRITICAL: Only OUTLET_ADMIN can process bypass requests
      if (user.role !== "OUTLET_ADMIN") {
        res.status(403).json({
          success: false,
          message:
            "Access denied. Only outlet admins can approve bypass requests.",
        });
        return;
      }

      // CRITICAL: Must have employee info
      if (!user.employee?.id) {
        throw new ApiError("Employee information not found", 400);
      }

      // CRITICAL: Must have outlet assignment
      const outletId = user.outletId;
      if (!outletId) {
        res.status(400).json({
          success: false,
          message: "Outlet admin must have outlet assignment",
        });
        return;
      }

      const bodyDto = plainToInstance(ProcessBypassRequestDTO, req.body);
      const validationErrors = await validate(bodyDto);

      if (validationErrors.length > 0) {
        const errorMessages = validationErrors
          .map((error) => Object.values(error.constraints || {}).join(", "))
          .join("; ");
        throw new ApiError(`Validation failed: ${errorMessages}`, 400);
      }

      // Approve bypass request for this outlet only
      const result = await this.bypassService.approveBypassRequest(
        id,
        bodyDto,
        user.employee.id,
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

      // CRITICAL: Only OUTLET_ADMIN can process bypass requests
      if (user.role !== "OUTLET_ADMIN") {
        res.status(403).json({
          success: false,
          message:
            "Access denied. Only outlet admins can reject bypass requests.",
        });
        return;
      }

      // CRITICAL: Must have employee info
      if (!user.employee?.id) {
        throw new ApiError("Employee information not found", 400);
      }

      // CRITICAL: Must have outlet assignment
      const outletId = user.outletId;
      if (!outletId) {
        res.status(400).json({
          success: false,
          message: "Outlet admin must have outlet assignment",
        });
        return;
      }

      const bodyDto = plainToInstance(ProcessBypassRequestDTO, req.body);
      const validationErrors = await validate(bodyDto);

      if (validationErrors.length > 0) {
        const errorMessages = validationErrors
          .map((error) => Object.values(error.constraints || {}).join(", "))
          .join("; ");
        throw new ApiError(`Validation failed: ${errorMessages}`, 400);
      }

      // Reject bypass request for this outlet only
      const result = await this.bypassService.rejectBypassRequest(
        id,
        bodyDto,
        user.employee.id,
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
      const user = (req as any).user;

      // CRITICAL: Only OUTLET_ADMIN can access bypass stats
      if (user.role !== "OUTLET_ADMIN") {
        res.status(403).json({
          success: false,
          message:
            "Access denied. Only outlet admins can view bypass statistics.",
        });
        return;
      }

      // CRITICAL: Must have outlet assignment
      const outletId = user.outletId;
      if (!outletId) {
        res.status(400).json({
          success: false,
          message: "Outlet admin must have outlet assignment",
        });
        return;
      }

      // Get stats for this outlet only
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
