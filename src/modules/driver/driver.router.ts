import { autoInjectable, injectable } from "tsyringe";
import { DriverController } from "./driver.controller";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { NextFunction, Request, Response, Router } from "express";
import { verifyRole } from "../../middleware/role.middleware";
import { env } from "../../config";
import { fileFilter, uploader } from "../../middleware/uploader.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import {
  CompleteDeliveryDto,
  CompletePickupDto,
} from "./dto/complete-request.dto";
import multer from "multer";

@autoInjectable()
export class DriverRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly driverController: DriverController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.getDriverJobs,
    );

    this.router.get(
      "/requests",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.getAvailableRequests,
    );

    this.router.get(
      "/details/:orderUuid",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.getOrderDetail,
    );

    this.router.get(
      "/history/:jobId/:jobType",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.getJobHistoryDetail,
    );

    this.router.post(
      "/claim-pickup/:pickUpJobId",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.claimPickUpRequest,
    );

    this.router.post(
      "/claim-delivery/:deliveryJobId",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.claimDeliveryRequest,
    );

    this.router.post(
      "/start-pickup/:pickupJobId",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.startPickUp,
    );

    this.router.post(
      "/complete-pickup/:pickupJobId",
      uploader().fields([{ name: "pickUpPhotos", maxCount: 1 }]),
      fileFilter,
      validateBody(CompletePickupDto),
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.completePickUp,
    );

    this.router.post(
      "/start-delivery/:deliveryJobId",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.startDelivery,
    );

    this.router.post(
      "/complete-delivery/:deliveryJobId",
      uploader().fields([{ name: "deliveryPhotos", maxCount: 1 }]),
      fileFilter,
      validateBody(CompleteDeliveryDto),
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.completeDelivery,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
