import { plainToInstance } from "class-transformer";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { GetBypassRequestListDto } from "./dto/get-bypass-list.dto";
import {
  finishBypassProcessDto,
  FinishOrderDto,
  GetWorkerJobsDto,
  RequestBypassDto,
} from "./dto/worker.dto";
import { WorkerService } from "./worker.service";

@injectable()
export class WorkerController {
  constructor(private readonly workerService: WorkerService) {}

  getStationOrders = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user?.id;
      const param = req.params.workerType || "all";
      const processedWorkerType = param.toLowerCase() === "all" ? "all" : param;
      const combinedInput = {
        ...req.query,
        workerType: processedWorkerType,
      };
      const queryDto = plainToInstance(GetWorkerJobsDto, combinedInput);

      if (
        !Object.values(["washing", "ironing", "packing", "all"]).includes(
          queryDto.workerType!,
        )
      ) {
        res.status(400).send({ error: "Invalid worker type provided." });
        return;
      }
      const result = await this.workerService.getStationOrders(
        Number(authUserId),
        queryDto,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  startOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const orderId = req.params.orderId;
      const bodyDto = plainToInstance(FinishOrderDto, req.body);

      const result = await this.workerService.startOrder(
        Number(authUserId),
        orderId,
        bodyDto,
      );
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  finishOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const orderId = req.params.orderId;
      const bodyDto = plainToInstance(FinishOrderDto, req.body);
      const result = await this.workerService.finishOrder(
        Number(authUserId),
        orderId,
        bodyDto,
      );
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  requestBypass = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const orderId = req.params.orderId;
      const bodyDto = plainToInstance(RequestBypassDto, req.body);
      const result = await this.workerService.requestBypass(
        Number(authUserId),
        orderId,
        bodyDto,
      );
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  finishBypassProcess = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user?.id;
      const bypassRequestId = Number(req.params.bypassRequestId);
      const bodyDto = plainToInstance(finishBypassProcessDto, req.body);
      const result = await this.workerService.finishBypassProcess(
        Number(authUserId),
        bypassRequestId,
        bodyDto,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getJobHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const queryDto = plainToInstance(GetWorkerJobsDto, req.query);
      const result = await this.workerService.getJobHistory(
        Number(authUserId),
        queryDto,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const { orderId } = req.params;
      const result = await this.workerService.getOrderDetail(
        Number(authUserId),
        orderId,
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
      const { orderId } = req.params;
      const result = await this.workerService.getOrderDetail(
        Number(authUserId),
        orderId,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getBypassRequestList = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user?.id;
      const queryDto = plainToInstance(GetBypassRequestListDto, req.query);
      const result = await this.workerService.getBypassRequestList(
        Number(authUserId),
        queryDto,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
