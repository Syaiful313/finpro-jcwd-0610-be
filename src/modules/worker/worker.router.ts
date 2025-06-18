import { autoInjectable } from "tsyringe";
import { Router } from "express";
import { WorkerController } from "./worker.controller";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { env } from "../../config";
import { validateBody } from "../../middleware/validation.middleware";
import {
  finishBypassProcessDto,
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
      "/",
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
      "/history/:orderId",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.getJobHistoryDetail,
    );

    this.router.get(
      "/orders/:orderId",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.getOrderDetail,
    );

    this.router.get(
      "/bypass-requests",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.getBypassRequestList,
    );

    this.router.get(
      "/:workerType",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.getStationOrders,
    );

    this.router.post(
      "/orders/:orderId/start",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.startOrder,
    );

    this.router.post(
      "/orders/:orderId/finish",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.finishOrder,
    );

    this.router.post(
      "/orders/:orderId/request-bypass",
      validateBody(RequestBypassDto),
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.requestBypass,
    );

    this.router.post(
      "/orders/complete-bypassed/:bypassRequestId",
      validateBody(finishBypassProcessDto),
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["WORKER"]),
      this.workerController.finishBypassProcess,
    );
  };

  public getRouter(): Router {
    return this.router;
  }
}
