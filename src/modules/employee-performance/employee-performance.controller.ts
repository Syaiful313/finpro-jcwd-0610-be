import { plainToInstance } from "class-transformer";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { GetEmployeePerformanceDTO } from "./dto/get-employee-performance.dto";
import { EmployeePerformanceService } from "./employee-performance.service";

@injectable()
export class EmployeePerformanceController {
  constructor(
    private readonly employeePerformanceService: EmployeePerformanceService,
  ) {}

  getEmployeePerformance = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const user = req.user as any;
      const query = plainToInstance(GetEmployeePerformanceDTO, req.query);

      const result =
        await this.employeePerformanceService.getEmployeePerformance(
          query,
          user.role,
          user.outletId,
        );

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
