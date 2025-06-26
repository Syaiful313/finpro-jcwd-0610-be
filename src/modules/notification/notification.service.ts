import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { GetNotificationsDTO } from "./dto/get-notif.dto";
import { count } from "console";

@injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  getDriverNotifications = async (authUserId: number) => {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
    });

    if (!employee) {
      throw new ApiError("Employee not found for this user", 400);
    }

    const notifications = await this.prisma.notification.findMany({
      where: {
        role: "DRIVER",
        Order: {
          outletId: employee.outletId,
        },
        //  fasdfa
        NOT: {
          readByUserIds: {
            has: authUserId,
          },
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

  getUserNotification = async (
    authUserId: number,
    limit: number,
    page: number,
  ) => {
    const user = await this.prisma.user.findFirst({
      where: { id: authUserId },
    });
    if (!user) {
      throw new ApiError("User not found", 400);
    }
    const notifications = await this.prisma.notification.findMany({
      where: {
        role: "CUSTOMER",
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
      skip: (page - 1) * limit,
    });
    return notifications;
  };

  getWorkerNotifications = async (authUserId: number) => {
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
        NOT: {
          readByUserIds: {
            has: authUserId,
          },
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

  markAsRead = async (authUserId: number, notificationId: number) => {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId },
    });
    if (!notification) {
      throw new ApiError("Notification not found", 404);
    }
    if (notification.readByUserIds.includes(authUserId)) {
      return { message: "Notification already marked as read" };
    }
    const updatedNotification = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        readByUserIds: {
          push: authUserId,
        },
      },
    });
    return updatedNotification;
  };

  markAllAsRead = async (authUserId: number) => {
    const result = await this.prisma.notification.updateMany({
      where: {
        NOT: {
          readByUserIds: {
            has: authUserId,
          },
        },
      },
      data: {
        readByUserIds: {
          push: authUserId,
        },
      },
    });

    return {
      message: "All unread notifications have been marked as read.",
      count: result.count,
    };
  };
}
