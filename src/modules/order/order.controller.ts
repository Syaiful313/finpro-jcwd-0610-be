import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { GetOrdersDTO } from "./dto/get-orders.dto";
import { OrderService } from "./order.service";
import { OrderValidation } from "./order.validation";

@injectable()
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly orderValidation: OrderValidation,
  ) {}

  getOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = plainToInstance(GetOrdersDTO, req.query);
      const validationErrors = await validate(query);

      if (validationErrors.length > 0) {
        const errorMessages = validationErrors
          .map((error) => Object.values(error.constraints || {}).join(", "))
          .join("; ");
        throw new ApiError(`Validation error: ${errorMessages}`, 400);
      }

      const user = (req as any).user;

      await this.orderValidation.validateOrderListAccess(
        user,
        query.outletId ? parseInt(query.outletId) : undefined,
      );

      const result = await this.orderService.getOrders(query, user);

      res.status(200).json({
        success: true,
        message: "Orders retrieved successfully",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  getOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.params;
      const user = (req as any).user;

      if (!orderId) {
        throw new ApiError("Order ID is required", 400);
      }

      const result = await this.orderValidation.validateOrderDetailAccess(
        user,
        orderId,
      );

      res.status(200).json({
        success: true,
        message: "Order detail retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  exportOrderTracking = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const query = plainToInstance(GetOrdersDTO, req.query);
      const user = (req as any).user;

      await this.orderValidation.validateOrderListAccess(
        user,
        query.outletId ? parseInt(query.outletId) : undefined,
      );

      const exportQuery = { ...query, page: 1, take: 10000 };
      const result = await this.orderService.getOrders(exportQuery, user);

      const exportData = result.data.map((order) => ({
        orderNumber: order.orderNumber,
        customerName: order.customer.name,
        customerEmail: order.customer.email,
        outletName: order.outlet.outletName,
        status: order.orderStatus,
        totalWeight: order.totalWeight,
        totalPrice: order.totalPrice,
        paymentStatus: order.paymentStatus,
        currentWorker: order.tracking.currentWorker?.name || "N/A",
        currentStation: order.tracking.currentWorker?.station || "N/A",
        pickupDriver: order.tracking.pickup?.driver || "N/A",
        deliveryDriver: order.tracking.delivery?.driver || "N/A",
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      }));

      res.status(200).json({
        success: true,
        message: "Order tracking data exported successfully",
        data: exportData,
        meta: {
          total: exportData.length,
          exportedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
