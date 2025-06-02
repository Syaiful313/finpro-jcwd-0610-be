import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { GetOutletsDTO } from "./dto/get-outlets.dto";
import { OutletService } from "./outlet.service";
import { CreateOutletDTO } from "./dto/create-outlet.dto";
import { UpdateOutletDTO } from "./dto/update-outlet.dto";
import { ApiError } from "../../utils/api-error";

@injectable()
export class OutletController {
  constructor(private readonly outletService: OutletService) {}

  getOutlets = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = plainToInstance(GetOutletsDTO, req.query);
      const result = await this.outletService.getOutlets(query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  createOutlet = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateOutletDTO;
      const result = await this.outletService.createOutlet(body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };
  updateOutlet = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const outletId = Number(req.params.id);
      const body: UpdateOutletDTO = req.body;

      if (isNaN(outletId) || outletId <= 0) {
        throw new ApiError("Invalid outlet ID", 400);
      }

      const result = await this.outletService.updateOutlet(outletId, body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteOutlet = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const outletId = Number(req.params.id);

      if (isNaN(outletId) || outletId <= 0) {
        throw new ApiError("Invalid outlet ID", 400);
      }

      const result = await this.outletService.deleteOutlet(outletId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
