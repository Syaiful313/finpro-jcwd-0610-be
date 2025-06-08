import { plainToInstance } from "class-transformer";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { GetEmployeesDTO } from "./dto/get-employees.dto";
import { EmployeeService } from "./employee.service";

@injectable()
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  getEmployees = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = plainToInstance(GetEmployeesDTO, req.query);
      const user = (req as any).user;

      const result = await this.employeeService.getEmployees(query, user);

      res.status(200).json({
        success: true,
        message: "Employees retrieved successfully",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };
}
