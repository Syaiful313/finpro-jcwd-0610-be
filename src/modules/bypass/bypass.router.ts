// src/routes/bypassRouter.ts
import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { BypassController } from "./bypass.controller";

@autoInjectable()
export class BypassRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly bypassController: BypassController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // CRITICAL: ALL routes require OUTLET_ADMIN role ONLY
    // Super Admin (ADMIN) should NOT have access to bypass process

    // GET /bypass-requests - Get list of outlet's bypass requests
    this.router.get(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["OUTLET_ADMIN"]), // ONLY OUTLET_ADMIN
      this.bypassController.getBypassRequests,
    );

    // GET /bypass-requests/stats - Get outlet's bypass request statistics
    this.router.get(
      "/stats",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["OUTLET_ADMIN"]), // ONLY OUTLET_ADMIN
      this.bypassController.getBypassRequestStats,
    );

    // GET /bypass-requests/:id - Get bypass request detail (outlet's only)
    this.router.get(
      "/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["OUTLET_ADMIN"]), // ONLY OUTLET_ADMIN
      this.bypassController.getBypassRequestDetail,
    );

    // POST /bypass-requests/:id/approve - Approve bypass request (outlet's only)
    this.router.post(
      "/:id/approve",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["OUTLET_ADMIN"]), // ONLY OUTLET_ADMIN
      this.bypassController.approveBypassRequest,
    );

    // POST /bypass-requests/:id/reject - Reject bypass request (outlet's only)
    this.router.post(
      "/:id/reject",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["OUTLET_ADMIN"]), // ONLY OUTLET_ADMIN
      this.bypassController.rejectBypassRequest,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
