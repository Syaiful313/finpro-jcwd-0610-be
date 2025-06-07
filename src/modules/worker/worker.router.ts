import { autoInjectable, injectable } from "tsyringe";
import { WorkerController } from "./worker.controller";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { Router } from "express";
import { env } from "../../config";
import { verifyRole } from "../../middleware/role.middleware";

@autoInjectable()
export class WorkerRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly workerController: WorkerController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }
  private initializeRoutes = (): void => {};

  getRouter(): Router {
    return this.router;
  }
}
