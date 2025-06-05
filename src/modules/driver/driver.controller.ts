import { plainToInstance } from "class-transformer";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { DriverService } from "./driver.service";
import { GetDriverDTO } from "./dto/driver.dto";

@injectable()
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

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
        Number(authUserId), // req.user?.id,
        query,
        requestType as "pickup" | "delivery" | "all",
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
