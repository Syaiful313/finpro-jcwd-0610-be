import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { EmployeePerformanceController } from "./employee-performance.controller";

@autoInjectable()
export class EmployeePerformanceRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly employeePerformanceController: EmployeePerformanceController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN", "OUTLET_ADMIN"]),
      this.employeePerformanceController.getEmployeePerformance,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}