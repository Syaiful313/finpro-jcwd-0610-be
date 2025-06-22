import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { CreatePickupOrderDTO } from "./dto/createPickupAndOrder.dto";
import { GetOrdersDTO } from "./dto/get-orders.dto";
import { GetPendingOrdersDTO } from "./dto/get-pending-orders.dto";
import { ProcessOrderDTO } from "./dto/proses-order.dto";
import { OrderTransformerService } from "./order-transformer.service";
import { OrderService } from "./order.service";
import { CurrentUser } from "./order.types";
import { OrderValidation } from "./order.validation";

@injectable()
export class OrderController {
  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  private static readonly SUCCESS_MESSAGES = {
    ORDERS_RETRIEVED: "Orders retrieved successfully",
    ORDER_DETAIL_RETRIEVED: "Order detail retrieved successfully",
    ORDER_TRACKING_EXPORTED: "Order tracking data exported successfully",
    PENDING_ORDERS_RETRIEVED: "Pending process orders retrieved successfully",
    ORDER_PROCESSED: "Order processed successfully",
    LAUNDRY_ITEMS_RETRIEVED: "Laundry items retrieved successfully",
  } as const;

  constructor(
    private readonly orderService: OrderService,
    private readonly orderValidation: OrderValidation,
    private readonly transformerService: OrderTransformerService,
  ) {}

  getOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = plainToInstance(GetOrdersDTO, req.query);
      await this.validateDTOAndThrow(query);

      const user = this.getCurrentUser(req);

      await this.orderValidation.validateOrderListAccess(
        user,
        query.outletId ? parseInt(query.outletId) : undefined,
      );

      const result = await this.orderService.getOrders(query, user);

      this.sendSuccessResponse(
        res,
        OrderController.SUCCESS_MESSAGES.ORDERS_RETRIEVED,
        result.data,
        result.meta,
      );
    } catch (error) {
      next(error);
    }
  };

  getOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.params;
      const user = this.getCurrentUser(req);

      this.validateRequiredParam(orderId, "Order ID");
      this.validateUUID(orderId, "Order ID");

      const result = await this.orderService.getOrderDetail(orderId, user);

      this.sendSuccessResponse(
        res,
        OrderController.SUCCESS_MESSAGES.ORDER_DETAIL_RETRIEVED,
        result,
      );
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
      const user = this.getCurrentUser(req);

      await this.orderValidation.validateOrderListAccess(
        user,
        query.outletId ? parseInt(query.outletId) : undefined,
      );

      const exportQuery = { ...query, page: 1, take: 10000 };
      const result = await this.orderService.getOrders(exportQuery, user);

      const exportData = this.transformerService.transformOrdersForExport(
        result.data,
      );

      this.sendSuccessResponse(
        res,
        OrderController.SUCCESS_MESSAGES.ORDER_TRACKING_EXPORTED,
        exportData,
        {
          total: exportData.length,
          exportedAt: new Date().toISOString(),
        },
      );
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
      await this.validateDTOAndThrow(query);

      const user = this.getCurrentUser(req);
      const result = await this.orderService.getPendingProcessOrders(
        query,
        user,
      );

      this.sendSuccessResponse(
        res,
        OrderController.SUCCESS_MESSAGES.PENDING_ORDERS_RETRIEVED,
        result.data,
        result.meta,
      );
    } catch (error) {
      next(error);
    }
  };

  processOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.params;
      const body = plainToInstance(ProcessOrderDTO, req.body);
      const user = this.getCurrentUser(req);

      this.validateRequiredParam(orderId, "Order ID");
      this.validateUUID(orderId, "Order ID");
      await this.validateDTOAndThrow(body);

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

      this.sendSuccessResponse(
        res,
        OrderController.SUCCESS_MESSAGES.LAUNDRY_ITEMS_RETRIEVED,
        result.data,
      );
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

  private validateDTOAndThrow = async <T>(dto: T): Promise<void> => {
    const validationErrors = await validate(dto as any);

    if (validationErrors.length > 0) {
      const errorMessages = validationErrors
        .map((error) => Object.values(error.constraints || {}).join(", "))
        .join("; ");
      throw new ApiError(`Validation error: ${errorMessages}`, 400);
    }
  };

  private validateUUID = (id: string, fieldName: string = "ID"): void => {
    if (!OrderController.UUID_REGEX.test(id)) {
      throw new ApiError(`Format ${fieldName} tidak valid`, 400);
    }
  };

  private validateRequiredParam = (param: any, fieldName: string): void => {
    if (!param) {
      throw new ApiError(`${fieldName} is required`, 400);
    }
  };

  private getCurrentUser = (req: Request): CurrentUser => {
    return (req as any).user;
  };

  private sendSuccessResponse = (
    res: Response,
    message: string,
    data?: any,
    meta?: any,
  ): void => {
    const response: any = {
      success: true,
      message,
    };

    if (data !== undefined) {
      response.data = data;
    }

    if (meta !== undefined) {
      response.meta = meta;
    }

    res.status(200).json(response);
  };
}
