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

    // LOGIKA DINAMIS:
    // 1. Notifikasi untuk semua driver (job belum di-assign ke siapa-siapa)
    // 2. Notifikasi untuk driver spesifik (job sudah di-assign ke driver ini)
    const whereClause: Prisma.NotificationWhereInput = {
      AND: [
        { role: "DRIVER" }, // Pastikan role adalah DRIVER
        {
          OR: [
            // Case 1: Pickup job belum di-assign (employeeId = null) - untuk semua driver
            {
              Order: {
                pickUpJobs: {
                  some: {
                    employeeId: null,
                  },
                },
              },
            },
            // Case 2: Pickup job sudah di-assign khusus untuk driver ini
            {
              Order: {
                pickUpJobs: {
                  some: {
                    employeeId: employee.id,
                  },
                },
              },
            },
            // Case 3: Delivery job belum di-assign (employeeId = null) - untuk semua driver
            {
              Order: {
                deliveryJobs: {
                  some: {
                    employeeId: null,
                  },
                },
              },
            },
            // Case 4: Delivery job sudah di-assign khusus untuk driver ini
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
            address_line: true,
            district: true,
            city: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
            // Include job info untuk mengetahui status assignment
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
}
