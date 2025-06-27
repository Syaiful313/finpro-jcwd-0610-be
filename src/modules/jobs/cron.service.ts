import { injectable } from "tsyringe";
import cron from "node-cron";
import { PrismaClient, OrderStatus } from "@prisma/client";

@injectable()
export class CronService {
  private prisma = new PrismaClient();

  public initializeJobs(): void {
    cron.schedule("*/30 * * * *", async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const orders = await this.prisma.order.findMany({
        where: {
          orderStatus: OrderStatus.DELIVERED_TO_CUSTOMER,
          actualDeliveryTime: { lte: twoDaysAgo },
        },
      });

      for (const order of orders) {
        await this.prisma.order.update({
          where: { uuid: order.uuid },
          data: { orderStatus: OrderStatus.COMPLETED },
        });

        await this.prisma.notification.create({
          data: {
            orderId: order.uuid,
            message: `Order #${order.orderNumber} auto-confirmed after 48h.`,
            notifType: "ORDER_FINISHED",
            orderStatus: OrderStatus.COMPLETED,
            role: "CUSTOMER",
            updatedAt: new Date(),
          },
        });
      }
    });

    cron.schedule(
      "58 23 * * *",
      async () => {
        try {
          const result = await this.autoClockOutEmployees();
        } catch (error) {
          console.error("Error during auto-clock out job:", error);
        }
      },
      {
        timezone: "Asia/Jakarta",
      },
    );
  }
  private async autoClockOutEmployees() {
    return this.prisma.$transaction(async (tx) => {
      const today = new Date();

      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);

      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);

      const uncloseAttendances = await tx.attendance.findMany({
        where: {
          clockInAt: {
            gte: startOfToday,
            lte: endOfToday,
          },
          clockOutAt: null,
        },
        include: {
          employee: {
            select: {
              id: true,
              userId: true,
            },
          },
        },
      });

      if (uncloseAttendances.length === 0) {
        return {
          updatedCount: 0,
          employeeIds: [],
          date: today.toDateString(),
        };
      }

      const updateResult = await tx.attendance.updateMany({
        where: {
          id: {
            in: uncloseAttendances.map((att) => att.id),
          },
        },
        data: {
          clockOutAt: endOfToday,
        },
      });

      const employeeIds = uncloseAttendances.map((att) => att.employee.userId);

      return {
        updatedCount: updateResult.count,
        employeeIds: employeeIds,
        date: today.toDateString(),
      };
    });
  }

  public async triggerAutoClockOut() {
    return await this.autoClockOutEmployees();
  }
}
