import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { OrderController } from "./order.controller";
import { validateBody } from "../../middleware/validation.middleware";
import { CreatePickupOrderDTO } from "./dto/createPickupAndOrder.dto";

@autoInjectable()
export class OrderRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly orderController: OrderController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN", "OUTLET_ADMIN"]),
      this.orderController.getOrders,
    );

    this.router.post(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET!),
      validateBody(CreatePickupOrderDTO),
      this.orderController.createPickupAndOrder,
    );

    this.router.get(
      "/:orderId",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN", "OUTLET_ADMIN"]),
      this.orderController.getOrderDetail,
    );

    this.router.get(
      "/export/tracking",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      verifyRole(["ADMIN", "OUTLET_ADMIN"]),
      this.orderController.exportOrderTracking,
    );

    this.router.get(
      "/user/:id",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      this.orderController.getOrdersByUser,
    );

    this.router.get(
      "/detail/:uuid",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET),
      this.orderController.getDetailOrder,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
