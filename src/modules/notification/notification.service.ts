import { injectable } from "tsyringe";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { PaginationService } from "../pagination/pagination.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { GetNotificationsDTO } from "./dto/get-notif.dto";
import { Prisma } from "@prisma/client";

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
    const { page, take, sortBy, sortOrder, all, search } = dto;

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

  getWorkerNotifications = async (
    authUserId: number,
    dto: GetNotificationsDTO,
  ) => {};

  markAsRead = async (authUserId: number, notificationId: number) => {};

  markAllAsRead = async (authUserId: number) => {};
}
