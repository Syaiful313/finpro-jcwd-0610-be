import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { GetNotificationsDTO } from "./dto/get-notif.dto";

@injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  getDriverNotifications = async (
    authUserId: number,
    dto: GetNotificationsDTO,
  ) => {
    const { page, take, sortBy, sortOrder, all } = dto;

    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee) {
      throw new Error("Employee not found for this user");
    }

    const whereClause: Prisma.NotificationWhereInput = {
      AND: [
        { role: "DRIVER" },
        {
          OR: [
            {
              Order: {
                pickUpJobs: {
                  some: {
                    employeeId: null,
                  },
                },
              },
            },
            {
              Order: {
                pickUpJobs: {
                  some: {
                    employeeId: employee.id,
                  },
                },
              },
            },
            {
              Order: {
                deliveryJobs: {
                  some: {
                    employeeId: null,
                  },
                },
              },
            },
            {
              Order: {
                deliveryJobs: {
                  some: {
                    employeeId: employee.id,
                  },
                },
              },
            },
          ],
        },
      ],
    };

    let paginationArgs: Prisma.NotificationFindManyArgs = {};

    if (!all) {
      paginationArgs = {
        skip: (page - 1) * take,
        take,
      };
    }

    const notifications = await this.prisma.notification.findMany({
      where: whereClause,
      include: {
        Order: {
          select: {
            uuid: true,
            orderNumber: true,
            orderStatus: true,
            addressLine: true,
            district: true,
            city: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
            pickUpJobs: {
              select: {
                id: true,
                employeeId: true,
                status: true,
              },
            },
            deliveryJobs: {
              select: {
                id: true,
                employeeId: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      ...paginationArgs,
    });

    const count = await this.prisma.notification.count({ where: whereClause });

    return {
      data: notifications,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };

  getUserNotification = async (authUserId: number, limit: number) => {
    const user = await this.prisma.user.findFirst({
      where: { id: authUserId },
    });
    if (!user) {
      throw new ApiError("User not found", 400);
    }
    const notifications = await this.prisma.notification.findMany({
      where: {
        notifType: {
          in: [
            "PICKUP_STARTED",
            "PICKUP_COMPLETED",
            "DELIVERY_STARTED",
            "DELIVERY_COMPLETED",
            "ORDER_COMPLETED",
          ],
        },
        Order: {
          user: {
            id: authUserId,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      include: {},
    });
    return notifications;
  };

  getWorkerNotifications = async (
    authUserId: number,
    dto: GetNotificationsDTO,
  ) => {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
    });

    if (!employee) {
      throw new ApiError("Employee not found for this user", 400);
    }

    const notifications = await this.prisma.notification.findMany({
      where: {
        role: "WORKER",
        Order: {
          outletId: employee.outletId,
        },
      },
      take: 5,
      include: {
        Order: {
          select: {
            uuid: true,
            orderNumber: true,
            orderStatus: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { data: notifications };
  };

  markAsRead = async (authUserId: number, notificationId: number) => {};

  markAllAsRead = async (authUserId: number) => {};
}
