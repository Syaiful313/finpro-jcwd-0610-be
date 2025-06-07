import { autoInjectable, injectable } from "tsyringe";
import { DriverController } from "./driver.controller";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { Router } from "express";
import { verifyRole } from "../../middleware/role.middleware";
import { env } from "../../config";
import { fileFilter, uploader } from "../../middleware/uploader.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import {
  CompleteDeliveryDto,
  CompletePickupDto,
} from "./dto/complete-request.dto";

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

    // Get available requests
    this.router.get(
      "/requests",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.getAvailableRequests,
    );

    // Claim pickup request
    this.router.post(
      "/claim-pickup/:pickUpJobId",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.claimPickUpRequest,
    );

    // Claim delivery request
    this.router.post(
      "/claim-delivery/:deliveryJobId",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.claimDeliveryRequest,
    );

    // Start pickup job
    this.router.post(
      "/start-pickup/:pickupJobId",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.startPickUp,
    );

    // Complete pickup job
    this.router.post(
      "/complete-pickup/:pickupJobId",
      uploader().fields([{ name: "pickUpPhotos", maxCount: 1 }]),
      fileFilter,
      validateBody(CompletePickupDto),
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.completePickUp,
    );

    // Start delivery job
    this.router.post(
      "/start-delivery/:deliveryJobId",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["DRIVER"]),
      this.driverController.startDelivery,
    );

    // complete delivery
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
