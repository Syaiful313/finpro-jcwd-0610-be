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

    // Get available requests
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
      // (req, res, next) => {
      //   console.log("=== BEFORE MULTER ===");
      //   console.log("Content-Type:", req.headers["content-type"]);
      //   console.log("Method:", req.method);
      //   next();
      // },

      // (req, res, next) => {
      //   const upload = uploader().fields([
      //     { name: "deliveryPhotos", maxCount: 1 },
      //   ]);
      //   upload(req, res, (err) => {
      //     if (err) {
      //       console.log("=== MULTER ERROR ===", err.message);
      //       console.log("Error code:", err.code);
      //       return res.status(400).json({ message: err.message });
      //     }
      //     console.log("=== MULTER SUCCESS ===");
      //     console.log("Files:", req.files);
      //     console.log("Body:", req.body);
      //     next();
      //   });
      // },
      // (req, res, next) => {
      //   console.log("=== AFTER MULTER MIDDLEWARE ===");
      //   console.log("Files exists:", !!req.files);
      //   console.log("Body exists:", !!req.body);
      //   next();
      // },
      // (req, res) => {
      //   console.log("=== REACHED CONTROLLER ===");
      //   res.json({ message: "Test successful", files: !!req.files });
      // },
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
