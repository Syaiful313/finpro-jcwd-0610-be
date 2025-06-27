import {
  BypassProcess,
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
import { GetBypassRequestListDto } from "./dto/get-bypass-list.dto";
import {
  finishBypassProcessDto,
  FinishOrderDto,
  GetWorkerHistoryDto,
  GetWorkerJobsDto,
  ProcessOrderDto,
  RequestBypassDto,
} from "./dto/worker.dto";
import { AttendanceService } from "../attendance/attendance.service";

@injectable()
export class WorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly attendanceService: AttendanceService,
  ) {}

  getStationOrders = async (authUserId: number, dto: GetWorkerJobsDto) => {
    await this.attendanceService.ensureEmployeeIsClockedIn(authUserId);
    const { page, take, sortBy, sortOrder, all, workerType, dateFrom, dateTo } =
      dto;

    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee || employee.user.role !== "WORKER") {
      throw new ApiError("Worker not found", 404);
    }

    let orderStatusFilter: OrderStatus | OrderStatus[];
    if (workerType === "all") {
      orderStatusFilter = [
        OrderStatus.ARRIVED_AT_OUTLET,
        OrderStatus.BEING_WASHED,
        OrderStatus.BEING_IRONED,
      ];
    } else {
      switch (workerType) {
        case "washing":
          orderStatusFilter = OrderStatus.ARRIVED_AT_OUTLET;
          break;
        case "ironing":
          orderStatusFilter = OrderStatus.BEING_WASHED;
          break;
        case "packing":
          orderStatusFilter = OrderStatus.BEING_IRONED;
          break;
        default:
          orderStatusFilter = [];
          break;
      }
    }

    const dateFilter: any = {};
    if (dateFrom) {
      dateFilter.gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo) {
      dateFilter.lte = new Date(`${dateTo}T23:59:59.999Z`);
    }

    const whereClause: Prisma.OrderWhereInput = {
      outletId: employee.outletId,
      orderStatus: Array.isArray(orderStatusFilter)
        ? { in: orderStatusFilter }
        : orderStatusFilter,

      ...(Object.keys(dateFilter).length > 0 && {
        createdAt: dateFilter,
      }),
      orderWorkProcess: {
        none: {
          bypass: {
            bypassStatus: {
              in: [BypassStatus.PENDING],
            },
          },
        },
      },
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
          select: { firstName: true, lastName: true },
        },
        outlet: {
          select: { outletName: true },
        },
        orderItems: {
          include: { laundryItem: true },
        },
        orderWorkProcess: {
          include: {
            employee: {
              select: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            bypass: {
              where: {
                bypassStatus: "APPROVED",
              },
            },
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

  startOrder = async (
    authUserId: number,
    orderId: string,
    dto: ProcessOrderDto,
  ) => {
    await this.attendanceService.ensureEmployeeIsClockedIn(authUserId);

    const { items } = dto;
    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
    });
    if (!employee) throw new ApiError("Worker not found", 404);

    const order = await this.prisma.order.findUnique({
      where: { uuid: orderId },
      include: { orderItems: true, orderWorkProcess: true },
    });
    if (!order) throw new ApiError("Order not found", 404);

    const existingWork = await this.prisma.orderWorkProcess.findFirst({
      where: {
        orderId: order.uuid,
        completedAt: null,

        OR: [
          { bypassId: null },
          {
            bypass: {
              bypassStatus: {
                in: [BypassStatus.PENDING, BypassStatus.APPROVED],
              },
            },
          },
        ],
      },
      include: {
        bypass: true,
      },
    });
    if (existingWork) {
      if (!existingWork.bypassId) {
        throw new ApiError(
          `Order is already being processed at the ${existingWork.workerType} station.`,
          400,
        );
      } else if (existingWork.bypass?.bypassStatus === BypassStatus.PENDING) {
        throw new ApiError(
          `Order has a pending bypass request at the ${existingWork.workerType} station. Please wait for admin approval.`,
          400,
        );
      } else if (existingWork.bypass?.bypassStatus === BypassStatus.APPROVED) {
        throw new ApiError(
          `Order has an approved bypass at the ${existingWork.workerType} station. Please use the bypass completion endpoint.`,
          400,
        );
      }
    }

    let workType: WorkerTypes;
    let newOrderStatus: OrderStatus;
    switch (order.orderStatus) {
      case OrderStatus.ARRIVED_AT_OUTLET:
        workType = WorkerTypes.WASHING;
        newOrderStatus = OrderStatus.BEING_WASHED;
        break;

      case OrderStatus.BEING_WASHED:
        workType = WorkerTypes.IRONING;
        newOrderStatus = OrderStatus.BEING_IRONED;
        break;

      case OrderStatus.BEING_IRONED:
        workType = WorkerTypes.PACKING;
        newOrderStatus = OrderStatus.BEING_PACKED;
        break;

      default:
        throw new ApiError(
          `Order with status ${order.orderStatus} cannot be started at a new station.`,
          400,
        );
    }

    const isQuantityMatching = items?.every((item) => {
      const dbItem = order.orderItems.find(
        (dbItm) => dbItm.laundryItemId === item.laundryItemId,
      );
      return dbItem && dbItem.quantity === item.quantity;
    });

    if (!isQuantityMatching) {
      throw new ApiError(
        "Item quantities do not match. Please request a bypass.",
        400,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let workProcess;

      const rejectedWorkProcess = await tx.orderWorkProcess.findFirst({
        where: {
          orderId: order.uuid,
          employeeId: employee.id,
          completedAt: null,
          workerType: workType,
          bypass: {
            bypassStatus: BypassStatus.REJECTED,
          },
        },
      });

      if (rejectedWorkProcess) {
        workProcess = await tx.orderWorkProcess.update({
          where: { id: rejectedWorkProcess.id },
          data: {
            updatedAt: new Date(),
          },
        });
        if (rejectedWorkProcess.bypassId) {
          await tx.bypassRequest.update({
            where: { id: rejectedWorkProcess.bypassId },
            data: {
              bypassProcess: BypassProcess.RE_VERIFY,
            },
          });
        }
      } else {
        workProcess = await tx.orderWorkProcess.create({
          data: {
            employeeId: employee.id,
            orderId: order.uuid,
            workerType: workType,
            completedAt: null,
          },
        });
      }

      await tx.order.update({
        where: { uuid: orderId },
        data: { orderStatus: newOrderStatus },
      });

      const actionType = rejectedWorkProcess
        ? "re-verified and resumed"
        : "started";

      return {
        message: `Verification successful. Order ${order.orderNumber} has been ${actionType} at the ${workType} station.`,
        workProcess: workProcess,
      };
    });
  };

  finishOrder = async (
    authUserId: number,
    orderId: string,
    dto: FinishOrderDto,
  ) => {
    await this.attendanceService.ensureEmployeeIsClockedIn(authUserId);

    const { notes } = dto;
    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });
    if (!employee) throw new ApiError("Worker not found", 404);

    const workInProgress = await this.prisma.orderWorkProcess.findFirst({
      where: {
        orderId: orderId,
        employeeId: employee.id,
        completedAt: null,
      },
      include: { order: true },
    });

    if (!workInProgress) {
      throw new ApiError(
        "No work in progress found for this order by you. Please start the work first.",
        404,
      );
    }

    const { order, workerType } = workInProgress;

    let nextStatus: OrderStatus;
    let notificationType: NotifType;
    let nextWorkerMessage: string | null = null;

    switch (workerType) {
      case WorkerTypes.WASHING:
        nextStatus = OrderStatus.BEING_WASHED;
        notificationType = NotifType.ORDER_STARTED;
        nextWorkerMessage = `New order ${order.orderNumber} is ready for ironing process.`;
        break;
      case WorkerTypes.IRONING:
        nextStatus = OrderStatus.BEING_IRONED;
        notificationType = NotifType.ORDER_STARTED;
        nextWorkerMessage = `New order ${order.orderNumber} is ready for packing process.`;
        break;
      case WorkerTypes.PACKING:
        nextStatus =
          order.paymentStatus === "PAID"
            ? OrderStatus.READY_FOR_DELIVERY
            : OrderStatus.WAITING_PAYMENT;
        notificationType = NotifType.ORDER_COMPLETED;
        break;
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.orderWorkProcess.update({
        where: { id: workInProgress.id },
        data: {
          notes: notes,
          completedAt: new Date(),
        },
      });

      let updatedOrder = order;

      if (workerType === WorkerTypes.PACKING) {
        updatedOrder = await tx.order.update({
          where: { uuid: orderId },
          data: { orderStatus: nextStatus },
        });
      }

      if (nextWorkerMessage) {
        await tx.notification.create({
          data: {
            orderId: order.uuid,
            message: nextWorkerMessage,
            notifType: NotifType.ORDER_STARTED,
            orderStatus: nextStatus,
            role: Role.WORKER,
          },
        });
      }

      if (nextStatus === OrderStatus.WAITING_PAYMENT) {
        await tx.notification.create({
          data: {
            orderId: order.uuid,
            message: `Your laundry is ready! Please complete the payment for Order ${order.orderNumber} to proceed with delivery.`,
            notifType: NotifType.ORDER_COMPLETED,
            orderStatus: nextStatus,
            role: Role.CUSTOMER,
          },
        });
      }
      if (nextStatus === OrderStatus.READY_FOR_DELIVERY) {
        await tx.deliveryJob.create({
          data: {
            orderId: order.uuid,
            employeeId: null,
          },
        });
        await tx.notification.create({
          data: {
            orderId: order.uuid,
            message: `New delivery request for Order ${order.orderNumber} is available to be claimed.`,
            notifType: NotifType.NEW_DELIVERY_REQUEST,
            orderStatus: nextStatus,
            role: Role.DRIVER,
          },
        });
      }

      return updatedOrder;
    });
  };

  requestBypass = async (
    authUserId: number,
    orderId: string,
    body: RequestBypassDto,
  ) => {
    await this.attendanceService.ensureEmployeeIsClockedIn(authUserId);

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

    let workerType: WorkerTypes;
    switch (order.orderStatus) {
      case OrderStatus.ARRIVED_AT_OUTLET:
        workerType = WorkerTypes.WASHING;
        break;
      case OrderStatus.BEING_WASHED:
        workerType = WorkerTypes.IRONING;
        break;
      case OrderStatus.BEING_IRONED:
        workerType = WorkerTypes.PACKING;
        break;
      default:
        throw new ApiError(
          `A bypass cannot be requested for an order with status ${order.orderStatus}.`,
          400,
        );
    }

    const bypassRequest = await this.prisma.$transaction(async (tx) => {
      const createdBypass = await tx.bypassRequest.create({
        data: {
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
          message: `A bypass has been requested by ${employee.user.firstName} for order ${order.orderNumber} at the ${workerType} station. Reason: ${reason}`,
          notifType: NotifType.BYPASS_REQUEST,
          role: Role.OUTLET_ADMIN,
        },
      });

      return createdBypass;
    });

    return bypassRequest;
  };

  finishBypassProcess = async (
    authUserId: number,
    bypassRequestId: number,
    dto: finishBypassProcessDto,
  ) => {
    await this.attendanceService.ensureEmployeeIsClockedIn(authUserId);

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
            completedAt: null,
          },
          include: {
            order: {
              include: {
                orderItems: true,
              },
            },
          },
        },
      },
    });

    if (!bypassRequest) {
      throw new ApiError("Bypass request not found", 404);
    }
    if (bypassRequest.bypassStatus === BypassStatus.PENDING) {
      throw new ApiError("Bypass request is still pending approval", 400);
    }
    if (
      ![BypassStatus.APPROVED, BypassStatus.REJECTED].includes(
        bypassRequest.bypassStatus,
      )
    ) {
      throw new ApiError("Invalid bypass request status", 400);
    }

    const workProcess = bypassRequest.orderWorkProcesses[0];
    if (!workProcess) {
      throw new ApiError(
        "No pending work process found for this bypass request and worker",
        404,
      );
    }

    const workerType = workProcess.workerType;
    const order = workProcess.order;

    let nextStatus: OrderStatus;
    let notificationType: NotifType;
    let outletAdminMessage: string;
    let nextWorkerMessage: string | null = null;

    if (bypassRequest.bypassStatus === BypassStatus.REJECTED) {
      nextStatus = order.orderStatus;
      notificationType = NotifType.BYPASS_REJECTED;
      outletAdminMessage = `Order ${order.orderNumber} bypass at ${workerType} station has been processed (rejected status).`;
    } else if (bypassRequest.bypassStatus === BypassStatus.APPROVED) {
      switch (workerType) {
        case "WASHING":
          nextStatus = OrderStatus.BEING_WASHED;
          notificationType = NotifType.BYPASS_APPROVED;
          outletAdminMessage = `Order ${order.orderNumber} has been processed at the Washing station with an approved bypass.`;
          nextWorkerMessage = `New order ${order.orderNumber} is ready for ironing process after bypass.`;
          break;
        case "IRONING":
          nextStatus = OrderStatus.BEING_IRONED;
          notificationType = NotifType.BYPASS_APPROVED;
          outletAdminMessage = `Order ${order.orderNumber} has been processed at the Ironing station with an approved bypass.`;
          nextWorkerMessage = `New order ${order.orderNumber} is ready for packing process after bypass.`;
          break;
        case "PACKING":
          nextStatus =
            order.paymentStatus === "PAID"
              ? OrderStatus.READY_FOR_DELIVERY
              : OrderStatus.WAITING_PAYMENT;
          notificationType = NotifType.BYPASS_APPROVED;
          outletAdminMessage = `All processes for Order ${order.orderNumber} are complete with an approved bypass by ${employee.user.firstName}.`;
          break;
      }
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const itemUpdatePromises = items.map((item) =>
        tx.orderItem.updateMany({
          where: {
            orderId: order.uuid,
            laundryItemId: item.laundryItemId,
          },
          data: {
            quantity: item.quantity,
          },
        }),
      );

      const [_, updatedWorkProcess] = await Promise.all([
        Promise.all(itemUpdatePromises),
        tx.orderWorkProcess.update({
          where: { id: workProcess.id },
          data: {
            notes: notes,
            completedAt: new Date(),
          },
        }),
      ]);

      let updated;
      if (bypassRequest.bypassStatus === BypassStatus.REJECTED) {
        const [orderUpdate] = await Promise.all([
          tx.order.update({
            where: { uuid: order.uuid },
            data: { orderStatus: nextStatus },
          }),
          tx.bypassRequest.update({
            where: { id: bypassRequestId },
            data: {
              bypassProcess: BypassProcess.COMPLETED,
            },
          }),
        ]);
        updated = orderUpdate;
      } else {
        updated = await tx.order.update({
          where: { uuid: order.uuid },
          data: { orderStatus: nextStatus },
        });
      }

      const notifications = [];

      if (nextWorkerMessage) {
        notifications.push({
          orderId: order.uuid,
          message: nextWorkerMessage,
          notifType: NotifType.ORDER_STARTED,
          orderStatus: nextStatus,
          role: Role.WORKER,
        });
      }

      notifications.push({
        orderId: order.uuid,
        message: outletAdminMessage,
        notifType: notificationType,
        orderStatus: nextStatus,
        role: Role.OUTLET_ADMIN,
      });

      if (nextStatus === OrderStatus.WAITING_PAYMENT) {
        notifications.push({
          orderId: order.uuid,
          message: `Your laundry is ready! Please complete the payment for Order ${order.orderNumber} to proceed with delivery.`,
          notifType: NotifType.ORDER_COMPLETED,
          orderStatus: nextStatus,
          role: Role.CUSTOMER,
        });
      }

      if (nextStatus === OrderStatus.READY_FOR_DELIVERY) {
        notifications.push(
          {
            orderId: order.uuid,
            message: `Payment confirmed! Order ${order.orderNumber} is now ready and waiting for a driver to deliver.`,
            notifType: NotifType.ORDER_COMPLETED,
            orderStatus: nextStatus,
            role: Role.CUSTOMER,
          },
          {
            orderId: order.uuid,
            message: `New delivery request for Order ${order.orderNumber} is available to be claimed.`,
            notifType: NotifType.NEW_DELIVERY_REQUEST,
            orderStatus: nextStatus,
            role: Role.DRIVER,
          },
        );
      }

      if (notifications.length > 0) {
        await tx.notification.createMany({
          data: notifications,
        });
      }

      return updated;
    });

    return updatedOrder;
  };

  getJobHistory = async (authUserId: number, dto: GetWorkerHistoryDto) => {
    const {
      page,
      take,
      sortBy = "createdAt",
      sortOrder = "desc",
      all,
      dateFrom,
      dateTo,
      workerType,
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

    let workerTypeFilter: any = {};
    if (workerType && workerType !== "all") {
      const typeMapping = {
        washing: "WASHING",
        ironing: "IRONING",
        packing: "PACKING",
      };
      workerTypeFilter = {
        workerType: typeMapping[workerType],
      };
    }

    const whereClause: Prisma.OrderWorkProcessWhereInput = {
      employeeId: employee.id,
      completedAt: {
        not: null,
      },
      ...workerTypeFilter,

      ...(Object.keys(dateFilter).length > 0 && {
        createdAt: dateFilter,
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
        bypass: true,
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
    await this.attendanceService.ensureEmployeeIsClockedIn(authUserId);

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
            phoneNumber: true,
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

  getJobHistoryDetail = async (authUserId: number, orderId: string) => {
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
        orderWorkProcess: {
          some: {
            employeeId: employee.id,
          },
        },
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
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
      throw new ApiError(
        "Order not found or you are not authorized to view this detail",
        404,
      );
    }
    return orderDetail;
  };

  getBypassRequestList = async (
    authUserId: number,
    dto: GetBypassRequestListDto,
  ) => {
    await this.attendanceService.ensureEmployeeIsClockedIn(authUserId);

    const { page, take, sortBy, sortOrder, all, status, dateFrom, dateTo } =
      dto;

    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee || employee.user.role !== "WORKER") {
      throw new ApiError("Worker not found or unauthorized", 404);
    }

    const dateFilter: any = {};
    if (dateFrom) {
      dateFilter.gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo) {
      dateFilter.lte = new Date(`${dateTo}T23:59:59.999Z`);
    }

    let prismaBypassStatus: BypassStatus | undefined;
    if (status) {
      prismaBypassStatus = status.toUpperCase() as BypassStatus;
    }

    const whereClause: Prisma.BypassRequestWhereInput = {
      orderWorkProcesses: {
        some: {
          employee: {
            outletId: employee.outletId,
          },
          ...(prismaBypassStatus === BypassStatus.APPROVED &&
            dto.includeCompleted !== "true" && {
              completedAt: null,
            }),
        },
      },
      ...(prismaBypassStatus && { bypassStatus: prismaBypassStatus }),
      ...(Object.keys(dateFilter).length > 0 && {
        createdAt: dateFilter,
      }),
    };

    const paginationArgs: any = all
      ? {}
      : {
          skip: (page - 1) * take,
          take,
        };

    const bypassRequests = await this.prisma.bypassRequest.findMany({
      where: whereClause,
      include: {
        approvedByEmployee: {
          select: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        orderWorkProcesses: {
          include: {
            order: {
              select: {
                uuid: true,
                orderNumber: true,
                orderStatus: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            employee: {
              select: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      ...paginationArgs,
    });

    const totalCount = await this.prisma.bypassRequest.count({
      where: whereClause,
    });

    return {
      data: bypassRequests,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? totalCount : take,
        count: totalCount,
      }),
    };
  };
}
