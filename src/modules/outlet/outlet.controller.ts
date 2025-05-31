import { plainToInstance } from "class-transformer";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { GetOutletsDTO } from "./dto/get-outlets.dto";
import { OutletService } from "./outlet.service";

@injectable()
export class OutletController {
  constructor(private readonly outletService: OutletService) {}

  getAllOutlets = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = plainToInstance(GetOutletsDTO, req.query);
      const currentUser = req.user as {
        id: number;
        role: string;
        outletId?: number;
      };
      
      const result = await this.outletService.getAllOutlets(query, currentUser);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}