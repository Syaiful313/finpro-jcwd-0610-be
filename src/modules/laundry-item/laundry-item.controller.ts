import { plainToInstance } from "class-transformer";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { GetLaundryItemsDTO } from "./dto/get-laundry-items.dto";
import { LaundryItemService } from "./laundry-item.service";
import { CreateLaundryItemDTO } from "./dto/create-loundry-item.dto";
import { UpdateLaundryItemDTO } from "./dto/update-laundry-item.dto";
import { ApiError } from "../../utils/api-error";

@injectable()
export class LaundryItemController {
  constructor(private readonly laundryItemService: LaundryItemService) {}

  getLaundryItems = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = plainToInstance(GetLaundryItemsDTO, req.query);
      const result = await this.laundryItemService.getLaundryItems(query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  createLaundryItem = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const body = req.body as CreateLaundryItemDTO;
      const result = await this.laundryItemService.createLaundryItem(body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateLaundryItem = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const laundryItemId = Number(req.params.id);
      const body: UpdateLaundryItemDTO = req.body;

      if (isNaN(laundryItemId) || laundryItemId <= 0) {
        throw new ApiError("Invalid laundry item ID", 400);
      }

      const result = await this.laundryItemService.updateLaundryItem(
        laundryItemId,
        body,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteLaundryItem = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const laundryItemId = Number(req.params.id);

      if (isNaN(laundryItemId) || laundryItemId <= 0) {
        throw new ApiError("Invalid laundry item ID", 400);
      }

      const result =
        await this.laundryItemService.deleteLaundryItem(laundryItemId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
