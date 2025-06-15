import { plainToInstance } from "class-transformer";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { WorkerService } from "./worker.service";
import {
  CompleteOrderProcessDto,
  GetWorkerJobsDto,
  ProcessOrderDto,
  RequestBypassDto,
} from "./dto/worker.dto";
import { WorkerTypes } from "@prisma/client";

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
      const workerType = req.params.workerType as WorkerTypes;

      // Validate workerType parameter
      if (!Object.values(WorkerTypes).includes(workerType)) {
        res.status(400).send({ error: "Invalid worker type provided." });
        return; // <-- PERBAIKAN
      }

      const queryDto = plainToInstance(GetWorkerJobsDto, req.query);
      const result = await this.workerService.getStationOrders(
        Number(authUserId),
        queryDto,
        workerType,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  processOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const orderId = req.params.orderId;
      const workerType = req.params.workerType as WorkerTypes;

      if (!Object.values(WorkerTypes).includes(workerType)) {
        res.status(400).send({ error: "Invalid worker type provided." });
        return; // <-- PERBAIKAN
      }

      const bodyDto = plainToInstance(ProcessOrderDto, req.body);
      const result = await this.workerService.processOrder(
        Number(authUserId),
        orderId,
        bodyDto,
        workerType,
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
      const workerType = req.params.workerType as WorkerTypes;

      if (!Object.values(WorkerTypes).includes(workerType)) {
        res.status(400).send({ error: "Invalid worker type provided." });
        return; // <-- PERBAIKAN
      }

      const bodyDto = plainToInstance(RequestBypassDto, req.body);
      const result = await this.workerService.requestBypass(
        Number(authUserId),
        orderId,
        bodyDto,
        workerType,
      );
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  completeOrderProcess = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user?.id;
      const bypassRequestId = Number(req.params.bypassRequestId);
      const workerType = req.params.workerType as WorkerTypes;

      if (!Object.values(WorkerTypes).includes(workerType)) {
        res.status(400).send({ error: "Invalid worker type provided." });
        return; // <-- PERBAIKAN
      }

      const bodyDto = plainToInstance(CompleteOrderProcessDto, req.body);
      const result = await this.workerService.completeOrderProcess(
        Number(authUserId),
        bypassRequestId,
        bodyDto,
        workerType,
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
}
