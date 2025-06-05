import {
  DriverTaskStatus,
  NotifType,
  OrderStatus,
  Prisma,
} from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CompleteDeliveryDto,
  CompletePickupDto,
} from "./dto/complete-pickup.dto";
import { GetDriverDTO } from "./dto/driver.dto";

@injectable()
export class DriverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  isDriverBusy = async (authUserId: number) => {
    const employee = await this.prisma.employee.findUnique({
      where: { id: authUserId },
      include: { user: true },
    });
    if (!employee || employee.user.role !== "DRIVER") {
      throw new ApiError("Driver not found", 404);
    }
    const activePickups = await this.prisma.pickUpJob.count({
      where: {
        employeeId: employee.id,
        status: {
          in: [DriverTaskStatus.ASSIGNED, DriverTaskStatus.IN_PROGRESS],
        },
      },
    });
    const activeDeliveries = await this.prisma.pickUpJob.count({
      where: {
        employeeId: employee.id,
        status: {
          in: [DriverTaskStatus.ASSIGNED, DriverTaskStatus.IN_PROGRESS],
        },
      },
    });
    return activePickups + activeDeliveries > 0;
  };

  hasReachedOrderLimit = async (authUserId: number) => {
    const employee = await this.prisma.employee.findUnique({
      where: { id: authUserId },
      include: { user: true },
    });
    if (!employee || employee.user.role !== "DRIVER") {
      throw new ApiError("Driver not found", 404);
    }
    const claimedPickups = await this.prisma.pickUpJob.count({
      where: {
        employeeId: employee.id,
        status: {
          in: [DriverTaskStatus.ASSIGNED, DriverTaskStatus.IN_PROGRESS],
        },
      },
    });
    const claimedDeliveries = await this.prisma.pickUpJob.count({
      where: {
        employeeId: employee.id,
        status: {
          in: [DriverTaskStatus.ASSIGNED, DriverTaskStatus.IN_PROGRESS],
        },
      },
    });
    return claimedPickups + claimedDeliveries >= 5;
  };

  getAvailableRequests = async (
    authUserId: number,
    dto: GetDriverDTO,
    requestType?: "pickup" | "delivery" | "all",
  ) => {
    const {
      page,
      take,
      sortBy = "createdAt",
      sortOrder = "desc",
      all,
      search,
    } = dto;

    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee || employee.user.role !== "DRIVER") {
      throw new ApiError("Employee not found", 404);
    }

    const isBusy = await this.isDriverBusy(authUserId);
    const hasReachedLimit = await this.hasReachedOrderLimit(authUserId);

    let whereClause: any = {
      outletId: employee.outletId,
    };

    if (requestType === "pickup") {
      whereClause = {
        ...whereClause,
        orderStatus: OrderStatus.WAITING_FOR_PICKUP,
        pickUpJobs: {
          none: {},
        },
      };
    } else if (requestType === "delivery") {
      whereClause = {
        ...whereClause,
        orderStatus: OrderStatus.READY_FOR_DELIVERY,
        paymentStatus: "PAID",
        deliveryJobs: {
          none: {},
        },
      };
    } else if (requestType === "all") {
      // Show both pickup and delivery requests
      whereClause = {
        ...whereClause,
        OR: [
          {
            orderStatus: OrderStatus.WAITING_FOR_PICKUP,
            pickUpJobs: {
              none: {},
            },
          },
          {
            orderStatus: OrderStatus.READY_FOR_DELIVERY,
            paymentStatus: "PAID",
            deliveryJobs: {
              none: {},
            },
          },
        ],
      };
    }

    let paginationArgs: Prisma.OrderFindManyArgs = {};

    if (!all) {
      paginationArgs = {
        skip: (page - 1) * take,
        take,
      };
    }

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
        outlet: {
          select: {
            outletName: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      ...paginationArgs,
    });

    const count = await this.prisma.order.count({ where: whereClause });

    const ordersWithClaimStatus = orders.map((order) => ({
      ...order,
      canClaim: !isBusy && !hasReachedLimit,
    }));

    return {
      data: ordersWithClaimStatus,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };

  getAvailablePickupRequests = async (
    authUserId: number,
    dto: GetDriverDTO,
  ) => {
    return this.getAvailableRequests(authUserId, dto, "pickup");
  };

  getAvailableDeliveryRequests = async (
    authUserId: number,
    dto: GetDriverDTO,
  ) => {
    return this.getAvailableRequests(authUserId, dto, "delivery");
  };

  claimPickUpRequest = async (authUserId: number, orderId: string) => {
    const employee = await this.prisma.employee.findUnique({
      where: { id: authUserId },
      include: { user: true },
    });

    if (!employee) {
      throw new ApiError("Employee not found", 404);
    }

    if (await this.isDriverBusy(authUserId)) {
      throw new ApiError("Driver is busy", 400);
    }

    const order = await this.prisma.order.findUnique({
      where: { uuid: orderId },
      include: { pickUpJobs: true },
    });

    if (!order) {
      throw new ApiError("Order not found", 404);
    }

    if (order.pickUpJobs.length > 0) {
      throw new ApiError("Order already claimed by another driver", 400);
    }

    if (order.orderStatus !== OrderStatus.WAITING_FOR_PICKUP) {
      throw new ApiError("Order is not available for pickup", 400);
    }

    const pickUpJob = await this.prisma.pickUpJob.create({
      data: {
        employeeId: employee.id,
        orderId: orderId,
        status: DriverTaskStatus.ASSIGNED,
        pickUpScheduleOutlet:
          order.scheduledPickupTime?.toISOString() || new Date().toISOString(),
      },
      include: {
        order: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });

    // Send notification to customer
    await this.prisma.notification.create({
      data: {
        userId: order.userId,
        message: `Driver has been assigned to pick up your laundry (Order #${order.orderNumber})`,
        notifType: NotifType.NEW_PICKUP_REQUEST,
        orderStatus: OrderStatus.WAITING_FOR_PICKUP,
        updatedAt: new Date(),
      },
    });

    return pickUpJob;
  };

  claimDeliveryRequest = async (authUserId: number, orderId: string) => {
    const employee = await this.prisma.employee.findUnique({
      where: { id: authUserId },
      include: { user: true },
    });

    if (!employee) {
      throw new ApiError("Employee not found", 404);
    }

    if (await this.isDriverBusy(authUserId)) {
      throw new ApiError("Driver is currently busy with another order", 400);
    }

    if (await this.hasReachedOrderLimit(authUserId)) {
      throw new ApiError(
        "Driver has reached maximum order limit (5 orders)",
        400,
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { uuid: orderId },
      include: { deliveryJobs: true },
    });

    if (!order) {
      throw new ApiError("Order not found", 404);
    }

    if (order.deliveryJobs.length > 0) {
      throw new ApiError("Order already claimed by another driver", 400);
    }

    if (order.orderStatus !== OrderStatus.READY_FOR_DELIVERY) {
      throw new ApiError("Order is not ready for delivery", 400);
    }

    const deliveryJob = await this.prisma.deliveryJob.create({
      data: {
        employeeId: employee.id,
        orderId: orderId,
        status: DriverTaskStatus.ASSIGNED,
      },
      include: {
        order: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });

    // Send notification to customer
    await this.prisma.notification.create({
      data: {
        userId: order.userId,
        message: `Driver has been assigned to deliver your laundry (Order #${order.orderNumber})`,
        notifType: NotifType.NEW_DELIVERY_REQUEST,
        orderStatus: OrderStatus.READY_FOR_DELIVERY,
      },
    });

    return deliveryJob;
  };

  startPickup = async (authUserId: number, orderId: string) => {
    const pickUpJob = await this.prisma.pickUpJob.findFirst({
      where: {
        employeeId: authUserId,
        orderId: orderId,
        status: DriverTaskStatus.ASSIGNED,
      },
      include: { order: true },
    });

    if (!pickUpJob) {
      throw new ApiError(
        "Pickup job not found or not assigned to this driver",
        404,
      );
    }

    const [updatedPickUpJob] = await this.prisma.$transaction([
      this.prisma.pickUpJob.update({
        where: { id: pickUpJob.id },
        data: { status: DriverTaskStatus.IN_PROGRESS },
      }),
      this.prisma.order.update({
        where: { uuid: orderId },
        data: { orderStatus: OrderStatus.DRIVER_ON_THE_WAY_TO_CUSTOMER },
      }),
    ]);

    // Notify customer
    await this.prisma.notification.create({
      data: {
        userId: pickUpJob.order.userId,
        message: `Driver is on the way to pick up your laundry (Order #${pickUpJob.order.orderNumber})`,
        notifType: NotifType.NEW_PICKUP_REQUEST,
        orderStatus: OrderStatus.DRIVER_ON_THE_WAY_TO_CUSTOMER,
        updatedAt: new Date(),
      },
    });

    return updatedPickUpJob;
  };

  completePickup = async (
    authUserId: number,
    orderId: string,
    body: Partial<CompletePickupDto>,
  ) => {
    const { notes, pickUpPhotos } = body;
    const pickUpJob = await this.prisma.pickUpJob.findFirst({
      where: {
        employeeId: authUserId,
        orderId: orderId,
        status: DriverTaskStatus.IN_PROGRESS,
      },
      include: { order: true },
    });

    if (!pickUpJob) {
      throw new ApiError("Pickup job not found or not in progress", 404);
    }

    const [updatedPickUpJob] = await this.prisma.$transaction([
      this.prisma.pickUpJob.update({
        where: { id: pickUpJob.id },
        data: {
          status: DriverTaskStatus.COMPLETED,
          notes: notes,
          pickUpPhotos: pickUpPhotos,
        },
      }),
      this.prisma.order.update({
        where: { uuid: orderId },
        data: {
          orderStatus: OrderStatus.DRIVER_ON_THE_WAY_TO_OUTLET,
          actualPickupTime: new Date(),
        },
      }),
    ]);

    // Notify customer and outlet admin
    await this.prisma.notification.create({
      data: {
        userId: pickUpJob.order.userId,
        message: `Your laundry has been picked up and is on the way to outlet (Order #${pickUpJob.order.orderNumber})`,
        notifType: NotifType.NEW_PICKUP_REQUEST,
        orderStatus: OrderStatus.DRIVER_ON_THE_WAY_TO_OUTLET,
        updatedAt: new Date(),
      },
    });

    return updatedPickUpJob;
  };

  startDelivery = async (authUserId: number, orderId: string) => {
    const deliveryJob = await this.prisma.deliveryJob.findFirst({
      where: {
        employeeId: authUserId,
        orderId: orderId,
        status: DriverTaskStatus.ASSIGNED,
      },
      include: { order: true },
    });

    if (!deliveryJob) {
      throw new ApiError(
        "Delivery job not found or not assigned to this driver",
        404,
      );
    }

    const [updatedDeliveryJob] = await this.prisma.$transaction([
      this.prisma.deliveryJob.update({
        where: { id: deliveryJob.id },
        data: { status: DriverTaskStatus.IN_PROGRESS },
      }),
      this.prisma.order.update({
        where: { uuid: orderId },
        data: { orderStatus: OrderStatus.BEING_DELIVERED_TO_CUSTOMER },
      }),
    ]);

    // Notify customer
    await this.prisma.notification.create({
      data: {
        userId: deliveryJob.order.userId,
        message: `Your laundry is on the way to your address (Order #${deliveryJob.order.orderNumber})`,
        notifType: NotifType.NEW_DELIVERY_REQUEST,
        orderStatus: OrderStatus.BEING_DELIVERED_TO_CUSTOMER,
        updatedAt: new Date(),
      },
    });

    return updatedDeliveryJob;
  };

  completeDelivery = async (
    authUserId: number,
    orderId: string,
    body: Partial<CompleteDeliveryDto>,
  ) => {
    const { notes, deliveryPhotos } = body;
    const deliveryJob = await this.prisma.deliveryJob.findFirst({
      where: {
        employeeId: authUserId,
        orderId: orderId,
        status: DriverTaskStatus.IN_PROGRESS,
      },
      include: { order: true },
    });

    if (!deliveryJob) {
      throw new ApiError("Delivery job not found or not in progress", 404);
    }

    const [updatedDeliveryJob] = await this.prisma.$transaction([
      this.prisma.deliveryJob.update({
        where: { id: deliveryJob.id },
        data: {
          status: DriverTaskStatus.COMPLETED,
          notes: notes,
          deliveryPhotos: deliveryPhotos,
        },
      }),
      this.prisma.order.update({
        where: { uuid: orderId },
        data: {
          orderStatus: OrderStatus.DELIVERED_TO_CUSTOMER,
          actualDeliveryTime: new Date(),
        },
      }),
    ]);

    // Notify customer
    await this.prisma.notification.create({
      data: {
        userId: deliveryJob.order.userId,
        message: `Your laundry has been delivered successfully (Order #${deliveryJob.order.orderNumber})`,
        notifType: NotifType.ORDER_COMPLETED,
        orderStatus: OrderStatus.DELIVERED_TO_CUSTOMER,
        updatedAt: new Date(),
      },
    });

    return updatedDeliveryJob;
  };

  getOrderHistory = () => {};
}
