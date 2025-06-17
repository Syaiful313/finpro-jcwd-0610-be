import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { GetOrdersDTO } from "./dto/get-orders.dto";
import { GetPendingOrdersDTO } from "./dto/get-pending-orders.dto";
import { ProcessOrderDTO } from "./dto/proses-order.dto";
import { OrderService } from "./order.service";
import { OrderValidation } from "./order.validation";
import { CreatePickupOrderDTO } from "./dto/createPickupAndOrder.dto";

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

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(orderId)) {
        throw new ApiError("Format Order ID tidak valid", 400);
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

  getPendingProcessOrders = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const query = plainToInstance(GetPendingOrdersDTO, req.query);
      const validationErrors = await validate(query);

      if (validationErrors.length > 0) {
        const errorMessages = validationErrors
          .map((error) => Object.values(error.constraints || {}).join(", "))
          .join("; ");
        throw new ApiError(`Validation error: ${errorMessages}`, 400);
      }

      const user = (req as any).user;
      const result = await this.orderService.getPendingProcessOrders(
        query,
        user,
      );

      res.status(200).json({
        success: true,
        message: "Pending process orders retrieved successfully",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  processOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.params;
      const body = plainToInstance(ProcessOrderDTO, req.body);
      const user = (req as any).user;

      if (!orderId) {
        throw new ApiError("Order ID is required", 400);
      }

      const validationErrors = await validate(body);
      if (validationErrors.length > 0) {
        const errorMessages = validationErrors
          .map((error) => Object.values(error.constraints || {}).join(", "))
          .join("; ");
        throw new ApiError(`Validation error: ${errorMessages}`, 400);
      }

      const result = await this.orderService.processOrder(orderId, body, user);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getLaundryItems = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.orderService.getLaundryItems();

      res.status(200).json({
        success: true,
        message: "Laundry items retrieved successfully",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  createPickupAndOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user!.id;
      const body = plainToInstance(CreatePickupOrderDTO, req.body);
      const result = await this.orderService.createPickupAndOrder(
        authUserId,
        body,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getOrdersByUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = Number(req.params.id);
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;

      const result = await this.orderService.getOrdersByUser(
        authUserId,
        page,
        limit,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getDetailOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user!.id;
      const uuid = req.params.uuid;
      const result = await this.orderService.getDetailOrder(authUserId, uuid);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  confirmOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user!.id;
      const uuid = req.params.uuid;
      const result = await this.orderService.confirmOrder(authUserId, uuid);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
