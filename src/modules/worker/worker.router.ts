import { autoInjectable } from "tsyringe";
import { Router } from "express";
import { WorkerController } from "./worker.controller";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { env } from "../../config";
import { validateBody } from "../../middleware/validation.middleware";
import {
  CompleteOrderProcessDto,
  ProcessOrderDto,
  RequestBypassDto,
} from "./dto/worker.dto";

@autoInjectable()
export class WorkerRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly workerController: WorkerController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/orders/:workerType",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.getStationOrders,
    );

    this.router.get(
      "/history",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.getJobHistory,
    );

    this.router.get(
      "/orders/detail/:orderId",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.getOrderDetail,
    );

    this.router.post(
      "/orders/:orderId/process/:workerType",
      validateBody(ProcessOrderDto),
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.processOrder,
    );

    this.router.post(
      "/orders/:orderId/request-bypass/:workerType",
      validateBody(RequestBypassDto),
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.requestBypass,
    );

    this.router.post(
      "/orders/complete-bypassed/:bypassRequestId/:workerType",
      validateBody(CompleteOrderProcessDto),
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.completeOrderProcess,
    );
  };

  public getRouter(): Router {
    return this.router;
  }
}
