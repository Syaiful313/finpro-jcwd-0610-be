import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { SalesReportController } from "./sales-report.controller";

@autoInjectable()
export class SalesReportRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly salesReportController: SalesReportController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/sales-report",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN", "OUTLET_ADMIN"]),
      this.salesReportController.getSalesReport,
    );

    this.router.get(
      "/total-income",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN", "OUTLET_ADMIN"]),
      this.salesReportController.getTotalIncome,
    );

    this.router.get(
      "/outlet-comparison",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN"]),
      this.salesReportController.getOutletComparison,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
