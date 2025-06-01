import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { AttendanceController } from "./attendance.controller";

@autoInjectable()
export class AttendanceRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly attendanceController: AttendanceController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER", "OUTLET_ADMIN", "WORKER", "ADMIN"]),
      this.attendanceController.getAttendanceHistory,
    );

    this.router.get(
      "/history",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER", "OUTLET_ADMIN", "WORKER", "ADMIN"]),
      this.attendanceController.getAttendances,
    );

    this.router.get(
      "/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["OUTLET_ADMIN", "ADMIN"]),
      this.attendanceController.getAttendanceReport,
    );

    this.router.post(
      "/clock-in",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER", "OUTLET_ADMIN", "WORKER", "ADMIN"]),
      this.attendanceController.clockIn,
    );
    this.router.post(
      "/clock-out",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER", "OUTLET_ADMIN", "WORKER", "ADMIN"]),
      this.attendanceController.clockOut,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
