import {
  DriverTaskStatus,
  NotifType,
  OrderStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CompleteDeliveryDto,
  CompletePickupDto,
} from "./dto/complete-request.dto";
import { GetDriverDTO } from "./dto/driver.dto";

@injectable()
export class DriverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly fileService: CloudinaryService,
  ) {}
  // udah di cek
  isDriverBusy = async (employeeId: number) => {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });
    if (!employee || employee.user.role !== "DRIVER") {
      throw new ApiError("Driver not found", 404);
    }

    const activePickups = await this.prisma.pickUpJob.count({
      where: {
        employeeId: employee.id,
        status: {
          in: [DriverTaskStatus.IN_PROGRESS],
        },
      },
    });

    const activeDeliveries = await this.prisma.deliveryJob.count({
      where: {
        employeeId: employee.id,
        status: {
          in: [DriverTaskStatus.IN_PROGRESS],
        },
      },
    });

    return activePickups + activeDeliveries > 0;
  };

  // udah di cek
  hasReachedOrderLimit = async (employeeId: number) => {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
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

    const claimedDeliveries = await this.prisma.deliveryJob.count({
      where: {
        employeeId: employee.id,
        status: {
          in: [DriverTaskStatus.ASSIGNED, DriverTaskStatus.IN_PROGRESS],
        },
      },
    });

    return claimedPickups + claimedDeliveries >= 5;
  };

  // udah di cek
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

    const isBusy = await this.isDriverBusy(employee.id);
    const hasReachedLimit = await this.hasReachedOrderLimit(employee.id);

    let paginationArgs: Prisma.OrderFindManyArgs | any = {};
    if (!all) {
      paginationArgs = {
        skip: (page - 1) * take,
        take,
      };
    }

    let availableJobs: any[] = [];
    let totalCount = 0;

    if (requestType === "pickup" || requestType === "all") {
      // Get available pickup jobs (employeeId is null and status is PENDING)
      const pickupJobsWhere: any = {
        employeeId: null,
        status: DriverTaskStatus.PENDING,
        order: {
          outletId: employee.outletId,
        },
      };

      if (search) {
        pickupJobsWhere.order = {
          ...pickupJobsWhere.order,
          OR: [
            {
              orderNumber: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              user: {
                OR: [
                  {
                    firstName: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                  {
                    lastName: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                ],
              },
            },
          ],
        };
      }

      const pickupJobs = await this.prisma.pickUpJob.findMany({
        where: pickupJobsWhere,
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
              outlet: {
                select: {
                  outletName: true,
                },
              },
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        ...(requestType === "pickup" ? paginationArgs : {}),
      });

      const pickupCount = await this.prisma.pickUpJob.count({
        where: pickupJobsWhere,
      });

      availableJobs.push(
        ...pickupJobs.map((job) => ({
          ...job,
          jobType: "pickup" as const,
          canClaim: !isBusy && !hasReachedLimit,
        })),
      );

      if (requestType === "pickup") totalCount = pickupCount;
    }

    if (requestType === "delivery" || requestType === "all") {
      // Get available delivery jobs (employeeId is null and status is PENDING)
      const deliveryJobsWhere: any = {
        employeeId: null,
        status: DriverTaskStatus.PENDING,
        order: {
          outletId: employee.outletId,
          paymentStatus: "PAID",
        },
      };

      if (search) {
        deliveryJobsWhere.order = {
          ...deliveryJobsWhere.order,
          OR: [
            {
              orderNumber: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              user: {
                OR: [
                  {
                    firstName: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                  {
                    lastName: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                ],
              },
            },
          ],
        };
      }

      const deliveryJobs = await this.prisma.deliveryJob.findMany({
        where: deliveryJobsWhere,
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
              outlet: {
                select: {
                  outletName: true,
                },
              },
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        ...(requestType === "delivery" ? paginationArgs : {}),
      });

      const deliveryCount = await this.prisma.deliveryJob.count({
        where: deliveryJobsWhere,
      });

      availableJobs.push(
        ...deliveryJobs.map((job) => ({
          ...job,
          jobType: "delivery" as const,
          canClaim: !isBusy && !hasReachedLimit,
        })),
      );

      if (requestType === "delivery") totalCount = deliveryCount;
    }

    // For "all" request type, combine and sort
    if (requestType === "all") {
      availableJobs.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
      });

      totalCount = availableJobs.length;

      // Apply pagination for combined results
      if (!all) {
        const startIndex = (page - 1) * take;
        availableJobs = availableJobs.slice(startIndex, startIndex + take);
      }
    }

    return {
      data: availableJobs,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? totalCount : take,
        count: totalCount,
      }),
    };
  };

  // udah di cek
  claimPickUpRequest = async (authUserId: number, pickUpJobId: number) => {
    if (!pickUpJobId || typeof pickUpJobId !== "number") {
      throw new ApiError("Invalid pickup job ID", 400);
    }

    console.log("Received pickUpJobId:", pickUpJobId); // Debug log
    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee || employee.user.role !== "DRIVER") {
      throw new ApiError("Driver not found", 404);
    }

    if (await this.isDriverBusy(employee.id)) {
      throw new ApiError("Driver is currently busy with another order", 400);
    }

    if (await this.hasReachedOrderLimit(employee.id)) {
      throw new ApiError(
        "Driver has reached maximum order limit (5 orders)",
        400,
      );
    }

    const pickUpJob = await this.prisma.pickUpJob.findUnique({
      where: { id: pickUpJobId },
      include: {
        order: {
          include: {
            notifications: true,
          },
        },
      },
    });

    if (!pickUpJob) {
      throw new ApiError("Pickup job not found", 404);
    }

    if (pickUpJob.employeeId !== null) {
      throw new ApiError("Pickup job already claimed by another driver", 400);
    }

    if (pickUpJob.status !== DriverTaskStatus.PENDING) {
      throw new ApiError("Pickup job is not available", 400);
    }

    if (pickUpJob.order.outletId !== employee.outletId) {
      throw new ApiError("Pickup job is not from your outlet", 400);
    }

    const notificationMessage = `Good news! Driver ${employee.user.firstName} ${employee.user.lastName} has been assigned to pick up your laundry for Order #${pickUpJob.order.orderNumber}. You'll be notified when they're on the way!`;

    const updatedPickUpJob = await this.prisma.$transaction(async (tx) => {
      // Update pickup job with driver info
      const updatedJob = await tx.pickUpJob.update({
        where: { id: pickUpJobId },
        data: {
          employeeId: employee.id,
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

      // Create notification for customer
      await tx.notification.create({
        data: {
          orderId: pickUpJob.order.uuid,
          message: notificationMessage,
          notifType: NotifType.NEW_PICKUP_REQUEST,
          orderStatus: pickUpJob.order.orderStatus,
          role: Role.CUSTOMER,
          updatedAt: new Date(),
        },
      });

      return updatedJob;
    });

    return updatedPickUpJob;
  };

  claimDeliveryRequest = async (authUserId: number, deliveryJobId: number) => {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee || employee.user.role !== "DRIVER") {
      throw new ApiError("Driver not found", 404);
    }

    if (await this.isDriverBusy(employee.id)) {
      throw new ApiError("Driver is currently busy with another order", 400);
    }

    if (await this.hasReachedOrderLimit(employee.id)) {
      throw new ApiError(
        "Driver has reached maximum order limit (5 orders)",
        400,
      );
    }

    const deliveryJob = await this.prisma.deliveryJob.findUnique({
      where: { id: deliveryJobId },
      include: {
        order: {
          include: {
            notifications: true,
          },
        },
      },
    });

    if (!deliveryJob) {
      throw new ApiError("Delivery job not found", 404);
    }

    if (deliveryJob.employeeId !== null) {
      throw new ApiError("Delivery job already claimed by another driver", 400);
    }

    if (deliveryJob.status !== DriverTaskStatus.PENDING) {
      throw new ApiError("Delivery job is not available", 400);
    }

    if (deliveryJob.order.paymentStatus !== "PAID") {
      throw new ApiError("Order payment is not completed", 400);
    }

    if (deliveryJob.order.outletId !== employee.outletId) {
      throw new ApiError("Delivery job is not from your outlet", 400);
    }

    const notificationMessage = `Excellent! Your clean laundry is ready for delivery! Driver ${employee.user.firstName} ${employee.user.lastName} has been assigned to deliver Order #${deliveryJob.order.orderNumber}. You'll be notified when they're on the way!`;

    const updatedDeliveryJob = await this.prisma.$transaction(async (tx) => {
      // Update delivery job with driver info
      const updatedJob = await tx.deliveryJob.update({
        where: { id: deliveryJobId },
        data: {
          employeeId: employee.id,
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

      // Create notification for customer
      await tx.notification.create({
        data: {
          orderId: deliveryJob.order.uuid,
          message: notificationMessage,
          notifType: NotifType.NEW_PICKUP_REQUEST,
          orderStatus: deliveryJob.order.orderStatus,
          role: Role.CUSTOMER,
          updatedAt: new Date(),
        },
      });

      return updatedJob;
    });

    return updatedDeliveryJob;
  };

  // udah di cek
  startPickUp = async (authUserId: number, pickupJobId: number) => {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee || employee.user.role !== "DRIVER") {
      throw new ApiError("Driver not found", 404);
    }
    console.log("pickupJobId:", pickupJobId, typeof pickupJobId);
    console.log("employee.id:", employee.id, typeof employee.id);
    console.log("DriverTaskStatus.ASSIGNED:", DriverTaskStatus.ASSIGNED);
    const pickUpJob = await this.prisma.pickUpJob.findFirst({
      where: {
        id: pickupJobId,
        employeeId: employee.id,
        status: DriverTaskStatus.ASSIGNED,
      },
      include: {
        order: {
          include: {
            notifications: true,
          },
        },
      },
    });

    if (!pickUpJob) {
      throw new ApiError(
        "Pickup job not found or not assigned to this driver",
        404,
      );
    }

    const notificationMessages = {
      CUSTOMER: `Your driver ${employee.user.firstName} ${employee.user.lastName} is on the way to pick up your laundry! Order #${pickUpJob.order.orderNumber}`,
      OUTLET_ADMIN: `Driver ${employee.user.firstName} ${employee.user.lastName} has started pickup for Order #${pickUpJob.order.orderNumber}`,
      DRIVER: `You have started pickup task for Order #${pickUpJob.order.orderNumber}. Safe driving!`,
    };

    const updatedPickUpJob = await this.prisma.$transaction(async (tx) => {
      // Update pickup job status
      const updatedJob = await tx.pickUpJob.update({
        where: { id: pickUpJob.id },
        data: { status: DriverTaskStatus.IN_PROGRESS },
      });

      // Update order status
      await tx.order.update({
        where: { uuid: pickUpJob.order.uuid },
        data: { orderStatus: OrderStatus.DRIVER_ON_THE_WAY_TO_CUSTOMER },
      });

      // Create notification for customer
      await tx.notification.create({
        data: {
          orderId: pickUpJob.order.uuid,
          message: notificationMessages.CUSTOMER,
          notifType: NotifType.NEW_PICKUP_REQUEST,
          orderStatus: OrderStatus.DRIVER_ON_THE_WAY_TO_CUSTOMER,
          role: Role.CUSTOMER,
          updatedAt: new Date(),
        },
      });

      // Create notification for driver
      await tx.notification.create({
        data: {
          orderId: pickUpJob.order.uuid,
          message: notificationMessages.DRIVER,
          notifType: NotifType.NEW_PICKUP_REQUEST,
          orderStatus: OrderStatus.DRIVER_ON_THE_WAY_TO_CUSTOMER,
          role: Role.DRIVER,
          updatedAt: new Date(),
        },
      });

      // Create notification for outlet admin
      await tx.notification.create({
        data: {
          orderId: pickUpJob.order.uuid,
          message: notificationMessages.OUTLET_ADMIN,
          notifType: NotifType.NEW_PICKUP_REQUEST,
          orderStatus: OrderStatus.DRIVER_ON_THE_WAY_TO_CUSTOMER,
          role: Role.OUTLET_ADMIN,
          updatedAt: new Date(),
        },
      });

      return updatedJob;
    });

    return updatedPickUpJob;
  };

  // udah di cek
  completePickUp = async (
    authUserId: number,
    pickupJobId: number,
    body: Partial<CompletePickupDto>,
    pickUpPhotos: Express.Multer.File,
  ) => {
    const { notes } = body;

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: authUserId,
        user: { role: "DRIVER" },
      },
      include: {
        user: true,
        pickUpJobs: {
          where: {
            id: pickupJobId,
            status: DriverTaskStatus.IN_PROGRESS,
          },
          include: {
            order: { include: { notifications: true, user: true } },
          },
        },
      },
    });

    if (!employee) {
      throw new ApiError("Driver not found", 404);
    }

    const pickUpJob = employee.pickUpJobs[0];
    if (!pickUpJob) {
      throw new ApiError("Pickup job not found or not in progress", 404);
    }

    const { secure_url } = await this.fileService.upload(pickUpPhotos);

    const notificationMessages = {
      CUSTOMER: `Your laundry has been picked up successfully! Order #${pickUpJob.order.orderNumber} is now on the way to our outlet for processing.`,
      OUTLET_ADMIN: `Pickup task completed for Order #${pickUpJob.order.orderNumber}. Driver: ${employee.user.firstName} ${employee.user.lastName} is heading to outlet.`,
      DRIVER: `You have successfully completed pickup for Order #${pickUpJob.order.orderNumber}. Please head to the outlet.`,
    };

    const updatedPickUpJob = await this.prisma.$transaction(async (tx) => {
      // Update pickup job
      const updatedJob = await tx.pickUpJob.update({
        where: { id: pickUpJob.id },
        data: {
          status: DriverTaskStatus.COMPLETED,
          notes: notes,
          pickUpPhotos: secure_url,
        },
      });

      // Update order
      await tx.order.update({
        where: { uuid: pickUpJob.order.uuid },
        data: {
          orderStatus: OrderStatus.ARRIVED_AT_OUTLET,
          actualPickupTime: new Date(),
        },
      });

      // Create notification for customer
      await tx.notification.create({
        data: {
          orderId: pickUpJob.order.uuid,
          message: notificationMessages.CUSTOMER,
          notifType: NotifType.PICKUP_COMPLETED,
          orderStatus: OrderStatus.ARRIVED_AT_OUTLET,
          role: Role.CUSTOMER,
          updatedAt: new Date(),
        },
      });

      // Create notification for driver
      await tx.notification.create({
        data: {
          orderId: pickUpJob.order.uuid,
          message: notificationMessages.DRIVER,
          notifType: NotifType.PICKUP_COMPLETED,
          orderStatus: OrderStatus.ARRIVED_AT_OUTLET,
          role: Role.DRIVER,
          updatedAt: new Date(),
        },
      });

      // Create notification for outlet admin
      await tx.notification.create({
        data: {
          orderId: pickUpJob.order.uuid,
          message: notificationMessages.OUTLET_ADMIN,
          notifType: NotifType.PICKUP_COMPLETED,
          orderStatus: OrderStatus.ARRIVED_AT_OUTLET,
          role: Role.OUTLET_ADMIN,
          updatedAt: new Date(),
        },
      });

      return updatedJob;
    });

    return updatedPickUpJob;
  };

  // udah di cek
  startDelivery = async (authUserId: number, deliveryJobId: number) => {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee || employee.user.role !== "DRIVER") {
      throw new ApiError("Driver not found", 404);
    }

    const deliveryJob = await this.prisma.deliveryJob.findFirst({
      where: {
        id: deliveryJobId,
        employeeId: employee.id,
        status: DriverTaskStatus.ASSIGNED,
      },
      include: {
        order: {
          include: {
            notifications: true,
          },
        },
      },
    });

    if (!deliveryJob) {
      throw new ApiError(
        "Delivery job not found or not assigned to this driver",
        404,
      );
    }

    const notificationMessages = {
      CUSTOMER: `Great news! Your clean laundry is on the way! Driver ${employee.user.firstName} ${employee.user.lastName} is delivering Order #${deliveryJob.order.orderNumber}`,
      OUTLET_ADMIN: `Driver ${employee.user.firstName} ${employee.user.lastName} has started delivery for Order #${deliveryJob.order.orderNumber}`,
      DRIVER: `You have started delivery task for Order #${deliveryJob.order.orderNumber}. Safe driving!`,
    };

    const updatedDeliveryJob = await this.prisma.$transaction(async (tx) => {
      // Update delivery job status
      const updatedJob = await tx.deliveryJob.update({
        where: { id: deliveryJob.id },
        data: { status: DriverTaskStatus.IN_PROGRESS },
      });

      // Update order status
      await tx.order.update({
        where: { uuid: deliveryJob.order.uuid },
        data: { orderStatus: OrderStatus.BEING_DELIVERED_TO_CUSTOMER },
      });

      // Create notification for customer
      await tx.notification.create({
        data: {
          orderId: deliveryJob.order.uuid,
          message: notificationMessages.CUSTOMER,
          notifType: NotifType.NEW_DELIVERY_REQUEST,
          orderStatus: OrderStatus.BEING_DELIVERED_TO_CUSTOMER,
          role: Role.CUSTOMER,
          updatedAt: new Date(),
        },
      });

      // Create notification for driver
      await tx.notification.create({
        data: {
          orderId: deliveryJob.order.uuid,
          message: notificationMessages.DRIVER,
          notifType: NotifType.NEW_DELIVERY_REQUEST,
          orderStatus: OrderStatus.BEING_DELIVERED_TO_CUSTOMER,
          role: Role.DRIVER,
          updatedAt: new Date(),
        },
      });

      // Create notification for outlet admin
      await tx.notification.create({
        data: {
          orderId: deliveryJob.order.uuid,
          message: notificationMessages.OUTLET_ADMIN,
          notifType: NotifType.NEW_DELIVERY_REQUEST,
          orderStatus: OrderStatus.BEING_DELIVERED_TO_CUSTOMER,
          role: Role.OUTLET_ADMIN,
          updatedAt: new Date(),
        },
      });

      return updatedJob;
    });

    return updatedDeliveryJob;
  };

  // udah di cek
  completeDelivery = async (
    authUserId: number,
    deliveryJobId: number,
    body: Partial<CompleteDeliveryDto>,
    deliveryPhotos: Express.Multer.File,
  ) => {
    const { notes } = body;

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: authUserId,
        user: { role: "DRIVER" },
      },
      include: {
        user: true,
        deliveryJobs: {
          where: {
            id: deliveryJobId,
            status: DriverTaskStatus.IN_PROGRESS,
          },
          include: {
            order: { include: { notifications: true, user: true } },
          },
        },
      },
    });

    if (!employee) {
      throw new ApiError("Driver not found", 404);
    }

    const deliveryJob = employee.deliveryJobs[0];
    if (!deliveryJob) {
      throw new ApiError("Delivery job not found or not in progress", 404);
    }

    const { secure_url } = await this.fileService.upload(deliveryPhotos);

    const notificationMessages = {
      CUSTOMER: `Your laundry has been delivered successfully! Order #${deliveryJob.order.orderNumber} has been completed.`,
      OUTLET_ADMIN: `Delivery task completed for Order #${deliveryJob.order.orderNumber}. Driver: ${employee.user.firstName} ${employee.user.lastName}`,
      DRIVER: `You have successfully completed delivery for Order #${deliveryJob.order.orderNumber}`,
    };

    const updatedDeliveryJob = await this.prisma.$transaction(async (tx) => {
      // Update delivery job
      const updatedJob = await tx.deliveryJob.update({
        where: { id: deliveryJob.id },
        data: {
          status: DriverTaskStatus.COMPLETED,
          notes: notes,
          deliveryPhotos: secure_url,
        },
      });

      // Update order
      await tx.order.update({
        where: { uuid: deliveryJob.order.uuid },
        data: {
          orderStatus: OrderStatus.DELIVERED_TO_CUSTOMER,
          actualDeliveryTime: new Date(),
        },
      });

      // Create notification for customer
      await tx.notification.create({
        data: {
          orderId: deliveryJob.order.uuid,
          message: notificationMessages.CUSTOMER,
          notifType: NotifType.DELIVERY_COMPLETED,
          orderStatus: OrderStatus.DELIVERED_TO_CUSTOMER,
          role: Role.CUSTOMER,
          updatedAt: new Date(),
        },
      });

      // Create notification for driver
      await tx.notification.create({
        data: {
          orderId: deliveryJob.order.uuid,
          message: notificationMessages.DRIVER,
          notifType: NotifType.DELIVERY_COMPLETED,
          orderStatus: OrderStatus.DELIVERED_TO_CUSTOMER,
          role: Role.DRIVER,
          updatedAt: new Date(),
        },
      });

      // Create notification for outlet admin
      await tx.notification.create({
        data: {
          orderId: deliveryJob.order.uuid,
          message: notificationMessages.OUTLET_ADMIN,
          notifType: NotifType.DELIVERY_COMPLETED,
          orderStatus: OrderStatus.DELIVERED_TO_CUSTOMER,
          role: Role.OUTLET_ADMIN,
          updatedAt: new Date(),
        },
      });

      return updatedJob;
    });

    return updatedDeliveryJob;
  };

  getDriverJobs = async (
    authUserId: number,
    dto: GetDriverDTO,
    status?: "active" | "completed" | "all",
  ) => {
    const { page, take, sortBy = "createdAt", sortOrder = "desc", all } = dto;

    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee || employee.user.role !== "DRIVER") {
      throw new ApiError("Driver not found", 404);
    }

    let statusFilter: DriverTaskStatus[] = [];

    if (status === "active") {
      statusFilter = [DriverTaskStatus.ASSIGNED, DriverTaskStatus.IN_PROGRESS];
    } else if (status === "completed") {
      statusFilter = [DriverTaskStatus.COMPLETED];
    } else {
      statusFilter = [
        DriverTaskStatus.ASSIGNED,
        DriverTaskStatus.IN_PROGRESS,
        DriverTaskStatus.COMPLETED,
      ];
    }

    let paginationArgs: any = {};
    if (!all) {
      paginationArgs = {
        skip: (page - 1) * take,
        take,
      };
    }

    // Get pickup jobs
    const pickupJobs = await this.prisma.pickUpJob.findMany({
      where: {
        employeeId: employee.id,
        status: { in: statusFilter },
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
            outlet: {
              select: {
                outletName: true,
              },
            },
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      ...paginationArgs,
    });

    // Get delivery jobs
    const deliveryJobs = await this.prisma.deliveryJob.findMany({
      where: {
        employeeId: employee.id,
        status: { in: statusFilter },
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
            outlet: {
              select: {
                outletName: true,
              },
            },
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      ...paginationArgs,
    });

    // Combine and format the results
    const allJobs = [
      ...pickupJobs.map((job) => ({
        ...job,
        jobType: "pickup" as const,
        photos: job.pickUpPhotos,
      })),
      ...deliveryJobs.map((job) => ({
        ...job,
        jobType: "delivery" as const,
        photos: job.deliveryPhotos,
      })),
    ];

    // Sort combined results
    allJobs.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });

    const totalCount = pickupJobs.length + deliveryJobs.length;

    return {
      data: allJobs,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? totalCount : take,
        count: totalCount,
      }),
    };
  };

  // getOrderHistory = async (authUserId: number, dto: GetDriverDTO) => {
  //   return this.getDriverJobs(authUserId, dto, "completed");
  // };

  // getActiveJobs = async (authUserId: number, dto: GetDriverDTO) => {
  //   return this.getDriverJobs(authUserId, dto, "active");
  // };
}
