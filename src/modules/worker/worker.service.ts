import {
  BypassStatus,
  NotifType,
  OrderStatus,
  Prisma,
  Role,
  WorkerTypes,
} from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CompleteOrderProcessDto,
  GetWorkerJobsDto,
  ProcessOrderDto,
  RequestBypassDto,
} from "./dto/worker.dto";

@injectable()
export class WorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  getStationOrders = async (
    authUserId: number,
    dto: GetWorkerJobsDto,
    workerType: WorkerTypes,
  ) => {
    const { page, take, sortBy, sortOrder, all, search } = dto;

    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee || employee.user.role !== "WORKER") {
      throw new ApiError("Worker not found", 404);
    }

    let orderStatusFilter: OrderStatus;
    switch (workerType) {
      case "WASHING":
        orderStatusFilter = OrderStatus.ARRIVED_AT_OUTLET;
        break;
      case "IRONING":
        orderStatusFilter = OrderStatus.BEING_WASHED;
        break;
      case "PACKING":
        orderStatusFilter = OrderStatus.BEING_IRONED;
        break;
      default:
        throw new ApiError("Invalid worker type", 400);
    }

    const whereClause: Prisma.OrderWhereInput = {
      outletId: employee.outletId,
      orderStatus: orderStatusFilter,
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: "insensitive" } },
          {
            user: {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        ],
      }),
    };

    const paginationArgs: any = all
      ? {}
      : {
          skip: (page - 1) * take,
          take,
        };

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        orderItems: {
          include: {
            laundryItem: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      ...paginationArgs,
    });

    const totalCount = await this.prisma.order.count({ where: whereClause });

    return {
      data: orders,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? totalCount : take,
        count: totalCount,
      }),
    };
  };

  processOrder = async (
    authUserId: number,
    orderId: string,
    dto: ProcessOrderDto,
    workerType: WorkerTypes,
  ) => {
    const { items, notes } = dto;

    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee || employee.user.role !== "WORKER") {
      throw new ApiError("Worker not found", 404);
    }

    const order = await this.prisma.order.findUnique({
      where: { uuid: orderId },
      include: { orderItems: true },
    });

    if (!order) {
      throw new ApiError("Order not found", 404);
    }

    const previousStationItems = await this.prisma.orderItem.findMany({
      where: { orderId: order.uuid },
    });

    const isQuantityMatching = items?.every((item) => {
      const previousItem = previousStationItems.find(
        (pi) => pi.laundryItemId === item.laundryItemId,
      );
      return previousItem && previousItem.quantity === item.quantity;
    });

    if (!isQuantityMatching) {
      throw new ApiError(
        "Item quantities do not match the previous station. Please request a bypass.",
        400,
      );
    }

    let nextStatus: OrderStatus;
    let notificationType: NotifType;
    let notificationMessage: string;

    switch (workerType) {
      case "WASHING":
        nextStatus = OrderStatus.BEING_IRONED;
        notificationType = NotifType.ORDER_STARTED;
        notificationMessage = `Order #${order.orderNumber} has been washed and is now heading to the ironing station.`;
        break;
      case "IRONING":
        nextStatus = OrderStatus.BEING_PACKED;
        notificationType = NotifType.ORDER_STARTED;
        notificationMessage = `Order #${order.orderNumber} has been ironed and is now heading to the packing station.`;
        break;
      case "PACKING":
        nextStatus =
          order.paymentStatus === "PAID"
            ? OrderStatus.READY_FOR_DELIVERY
            : OrderStatus.WAITING_PAYMENT;
        notificationType = NotifType.ORDER_COMPLETED;
        notificationMessage = `All processes for Order #${order.orderNumber} are complete.`;
        break;
      default:
        throw new ApiError("Invalid worker type", 400);
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      await tx.orderWorkProcess.create({
        data: {
          employeeId: employee.id,
          orderId: order.uuid,
          workerType: workerType,
          notes: notes,
          completedAt: new Date(),
        },
      });

      const updated = await tx.order.update({
        where: { uuid: orderId },
        data: { orderStatus: nextStatus },
      });

      await tx.notification.create({
        data: {
          orderId: order.uuid,
          message: notificationMessage,
          notifType: notificationType,
          orderStatus: nextStatus,
          role: Role.OUTLET_ADMIN,
        },
      });

      if (nextStatus === OrderStatus.WAITING_PAYMENT) {
        await tx.notification.create({
          data: {
            orderId: order.uuid,
            message: `Your laundry is ready! Please complete the payment for Order #${order.orderNumber}.`,
            notifType: NotifType.ORDER_COMPLETED,
            orderStatus: nextStatus,
            role: Role.CUSTOMER,
          },
        });
      }

      if (nextStatus === OrderStatus.READY_FOR_DELIVERY) {
        await tx.notification.create({
          data: {
            orderId: order.uuid,
            message: `Payment confirmed! Your laundry for order #${order.orderNumber} is now ready for delivery.`,
            notifType: NotifType.ORDER_COMPLETED,
            orderStatus: nextStatus,
            role: Role.CUSTOMER,
          },
        });
      }

      return updated;
    });

    return updatedOrder;
  };

  requestBypass = async (
    authUserId: number,
    orderId: string,
    body: RequestBypassDto,
    workerType: WorkerTypes,
  ) => {
    const { reason } = body;
    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee) {
      throw new ApiError("Worker not found", 404);
    }

    const order = await this.prisma.order.findUnique({
      where: { uuid: orderId },
      include: {
        outlet: { include: { employees: { include: { user: true } } } },
      },
    });

    if (!order) {
      throw new ApiError("Order not found", 404);
    }

    const outletAdmin = order.outlet.employees.find(
      (e) => e.user.role === "OUTLET_ADMIN",
    );

    if (!outletAdmin) {
      throw new ApiError("Outlet admin not found for this outlet.", 404);
    }

    const bypassRequest = await this.prisma.$transaction(async (tx) => {
      const createdBypass = await tx.bypassRequest.create({
        data: {
          approvedBy: outletAdmin.id,
          reason: reason,
          bypassStatus: BypassStatus.PENDING,
        },
      });

      await tx.orderWorkProcess.create({
        data: {
          employeeId: employee.id,
          orderId: orderId,
          workerType: workerType,
          bypassId: createdBypass.id,
        },
      });

      await tx.notification.create({
        data: {
          orderId: orderId,
          message: `A bypass has been requested by ${employee.user.firstName} for order #${order.orderNumber} at the ${workerType} station. Reason: ${reason}`,
          notifType: NotifType.BYPASS_REQUEST,
          role: Role.OUTLET_ADMIN,
        },
      });

      return createdBypass;
    });

    return bypassRequest;
  };

  completeOrderProcess = async (
    authUserId: number,
    bypassRequestId: number,
    dto: CompleteOrderProcessDto,
    workerType: WorkerTypes,
  ) => {
    const { items, notes } = dto;
    if (!items || !Array.isArray(items)) {
      throw new ApiError(
        "An array of items is required to complete the process.",
        400,
      );
    }

    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId, user: { role: "WORKER" } },
      include: { user: true },
    });
    if (!employee) throw new ApiError("Worker not found", 404);

    const bypassRequest = await this.prisma.bypassRequest.findUnique({
      where: { id: bypassRequestId },
      include: {
        orderWorkProcesses: {
          where: {
            employeeId: employee.id,
            workerType: workerType,
            completedAt: null,
          },
          include: {
            order: true,
          },
        },
      },
    });

    if (!bypassRequest) throw new ApiError("Bypass request not found", 404);
    if (bypassRequest.bypassStatus !== BypassStatus.APPROVED) {
      throw new ApiError("Bypass request is not approved", 400);
    }

    const workProcess = bypassRequest.orderWorkProcesses[0];
    if (!workProcess)
      throw new ApiError(
        "No pending work process found for this bypass request and worker",
        404,
      );

    const order = workProcess.order;

    let nextStatus: OrderStatus;
    switch (workerType) {
      case "WASHING":
        nextStatus = OrderStatus.BEING_IRONED;
        break;
      case "IRONING":
        nextStatus = OrderStatus.BEING_PACKED;
        break;
      case "PACKING":
        nextStatus =
          order.paymentStatus === "PAID"
            ? OrderStatus.READY_FOR_DELIVERY
            : OrderStatus.WAITING_PAYMENT;
        break;
      default:
        throw new ApiError("Invalid worker type", 400);
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.orderItem.updateMany({
          where: {
            orderId: order.uuid,
            laundryItemId: item.laundryItemId,
          },
          data: {
            quantity: item.quantity,
          },
        });
      }

      await tx.orderWorkProcess.update({
        where: { id: workProcess.id },
        data: {
          notes: notes,
          completedAt: new Date(),
        },
      });

      const updated = await tx.order.update({
        where: { uuid: order.uuid },
        data: { orderStatus: nextStatus },
      });

      await tx.notification.create({
        data: {
          orderId: order.uuid,
          message: `Order #${order.orderNumber} has been processed at the ${workerType} station (with an approved bypass).`,
          notifType: NotifType.BYPASS_APPROVED,
          orderStatus: nextStatus,
          role: Role.OUTLET_ADMIN,
        },
      });

      if (nextStatus === OrderStatus.WAITING_PAYMENT) {
        await tx.notification.create({
          data: {
            orderId: order.uuid,
            message: `Your laundry is ready! Please complete the payment for Order #${order.orderNumber}.`,
            notifType: NotifType.ORDER_COMPLETED,
            orderStatus: nextStatus,
            role: Role.CUSTOMER,
          },
        });
      }

      if (nextStatus === OrderStatus.READY_FOR_DELIVERY) {
        await tx.notification.create({
          data: {
            orderId: order.uuid,
            message: `Payment confirmed! Your laundry for order #${order.orderNumber} is now ready for delivery.`,
            notifType: NotifType.ORDER_COMPLETED,
            orderStatus: nextStatus,
            role: Role.CUSTOMER,
          },
        });
      }

      return updated;
    });

    return updatedOrder;
  };

  getJobHistory = async (authUserId: number, dto: GetWorkerJobsDto) => {
    const {
      page,
      take,
      sortBy = "createdAt",
      sortOrder = "desc",
      all,
      search,
      dateFrom,
      dateTo,
    } = dto;

    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee || employee.user.role !== "WORKER") {
      throw new ApiError("Worker not found", 404);
    }

    const dateFilter: any = {};
    if (dateFrom) {
      dateFilter.gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo) {
      dateFilter.lte = new Date(`${dateTo}T23:59:59.999Z`);
    }

    const whereClause: Prisma.OrderWorkProcessWhereInput = {
      employeeId: employee.id,
      ...(Object.keys(dateFilter).length > 0 && {
        createdAt: dateFilter,
      }),
      ...(search && {
        order: {
          OR: [
            { orderNumber: { contains: search, mode: "insensitive" } },
            {
              user: {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          ],
        },
      }),
    };

    const paginationArgs: any = all
      ? {}
      : {
          skip: (page - 1) * take,
          take,
        };

    const jobHistory = await this.prisma.orderWorkProcess.findMany({
      where: whereClause,
      include: {
        order: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      ...paginationArgs,
    });

    const totalCount = await this.prisma.orderWorkProcess.count({
      where: whereClause,
    });

    return {
      data: jobHistory,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? totalCount : take,
        count: totalCount,
      }),
    };
  };

  getOrderDetail = async (authUserId: number, orderId: string) => {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId, user: { role: "WORKER" } },
    });

    if (!employee) {
      throw new ApiError("Worker not found or you are not authorized", 404);
    }

    const orderDetail = await this.prisma.order.findFirst({
      where: {
        uuid: orderId,
        outletId: employee.outletId,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        orderItems: {
          include: {
            laundryItem: true,
          },
        },
        orderWorkProcess: {
          include: {
            employee: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            bypass: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!orderDetail) {
      throw new ApiError("Order not found in your outlet", 404);
    }

    return orderDetail;
  };
}
