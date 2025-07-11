import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { EmployeeController } from "./employee.controller";

@autoInjectable()
export class EmployeeRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly employeeController: EmployeeController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN", "OUTLET_ADMIN"]),
      this.employeeController.getEmployees,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
