import { plainToInstance } from "class-transformer";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import {
  GetOutletComparisonDTO,
  GetSalesReportDTO,
} from "./dto/get-sales-report.dto";
import { SalesReportService } from "./sales-report.service";

interface UserFromJWT {
  id: number;
  email: string;
  role: string;
  outletId?: number;
}

@injectable()
export class SalesReportController {
  constructor(private readonly salesReportService: SalesReportService) {}

  getSalesReport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = plainToInstance(GetSalesReportDTO, req.query);
      const user = (req as any).user as UserFromJWT;

      if (user.role === "OUTLET_ADMIN" && !user.outletId) {
        throw new ApiError("No outlet assigned to user", 403);
      }

      const result = await this.salesReportService.getSalesReport(
        query,
        user.role,
        user.outletId,
      );

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getTotalIncome = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = (req as any).user as UserFromJWT;

      if (user.role === "OUTLET_ADMIN" && !user.outletId) {
        throw new ApiError("No outlet assigned to user", 403);
      }

      const filterOutletId =
        user.role === "ADMIN" && req.query.outletId
          ? Number(req.query.outletId)
          : undefined;

      const result = await this.salesReportService.getTotalIncome(
        user.role,
        user.outletId,
        filterOutletId,
      );

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getOutletComparison = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = plainToInstance(GetOutletComparisonDTO, req.query);

      const result = await this.salesReportService.getOutletComparison(query);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
