import { plainToInstance } from "class-transformer";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { DriverService } from "./driver.service";
import { GetDriverDTO } from "./dto/driver.dto";
import { ApiError } from "../../utils/api-error";
import { CompletePickupDto } from "./dto/complete-request.dto";

@injectable()
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  getDriverJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const queryDto = plainToInstance(GetDriverDTO, req.query);

      const result = await this.driverService.getDriverJobs(
        Number(authUserId),
        queryDto,
      );

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getAvailableRequests = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user?.id;
      const { type = "all", ...queryParams } = req.query;
      const query = plainToInstance(GetDriverDTO, queryParams);

      const requestType = type as string;
      if (!["pickup", "delivery", "all"].includes(requestType)) {
        res.status(400).send({
          error: "Invalid type parameter. Must be pickup, delivery, or all",
        });
        return;
      }

      const result = await this.driverService.getAvailableRequests(
        Number(authUserId),
        query,
        requestType as "pickup" | "delivery" | "all",
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  claimPickUpRequest = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user?.id;
      const { pickUpJobId } = req.params;
      const result = await this.driverService.claimPickUpRequest(
        Number(authUserId),
        Number(pickUpJobId),
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  claimDeliveryRequest = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user?.id;
      const { deliveryJobId } = req.params;
      const result = await this.driverService.claimDeliveryRequest(
        Number(authUserId),
        Number(deliveryJobId),
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  startPickUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const pickupJobId = parseInt(req.params.pickupJobId);
      const result = await this.driverService.startPickUp(
        Number(authUserId),
        pickupJobId,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  completePickUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const pickupJobId = parseInt(req.params.pickupJobId);
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const pickUpPhotos = files?.pickUpPhotos?.[0];
      if (!Boolean(pickUpPhotos)) throw new ApiError("Image is required", 400);

      const body = req.body as CompletePickupDto;
      const result = await this.driverService.completePickUp(
        Number(authUserId),
        pickupJobId,
        body,
        pickUpPhotos,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  startDelivery = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const { deliveryJobId } = req.params;
      const result = await this.driverService.startDelivery(
        Number(authUserId),
        Number(deliveryJobId),
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  completeDelivery = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user?.id;
      const deliveryJobId = parseInt(req.params.deliveryJobId);
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const deliveryPhotos = files?.deliveryPhotos?.[0];
      if (!Boolean(deliveryPhotos))
        throw new ApiError("Image is required", 400);
      const body = req.body as CompletePickupDto;

      const result = await this.driverService.completeDelivery(
        Number(authUserId),
        deliveryJobId,
        body,
        deliveryPhotos,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const { orderUuid } = req.params;
      const result = await this.driverService.getOrderDetail(
        Number(authUserId),
        orderUuid,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getJobHistoryDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user?.id;
      const { jobId, jobType } = req.params;
      const result = await this.driverService.getJobHistoryDetail(
        Number(authUserId),
        Number(jobId),
        jobType as "pickup" | "delivery",
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
