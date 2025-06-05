// src/modules/cron/cron.service.ts
import { injectable } from "tsyringe";
import * as schedule from "node-schedule";
import { PrismaService } from "../prisma/prisma.service";

@injectable()
export class CronService {
  private jobs: { [key: string]: schedule.Job } = {};

  constructor(private readonly prisma: PrismaService) {}

  initializeJobs = () => {
    this.dailyAutoClockOutJob();
  };

  private dailyAutoClockOutJob = () => {
    const job = schedule.scheduleJob(
      "daily-auto-clockout",
      "59 23 * * *",
      async () => {
        console.log(
          "Running daily auto clock-out job at:",
          new Date().toISOString(),
        );
        try {
          await this.autoClockOutCurrentDay();
          console.log(" Daily auto clock-out job completed successfully");
        } catch (error) {
          console.error("Daily auto clock-out job failed:", error);
        }
      },
    );

    this.jobs["daily-auto-clockout"] = job;
  };

  autoClockOutCurrentDay = async () => {
    const result = await this.prisma.$transaction(async (tx) => {
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
        return { updatedCount: 0 };
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

    return result;
  };

  triggerAutoClockOut = async () => {
    return await this.autoClockOutCurrentDay();
  };

  // Job management methods
  cancelJob = (jobName: string) => {
    if (this.jobs[jobName]) {
      this.jobs[jobName].cancel();
      delete this.jobs[jobName];
    }
  };

  rescheduleJob = (jobName: string, newTime: string | Date) => {
    if (this.jobs[jobName]) {
      this.jobs[jobName].reschedule(newTime);
    }
  };

  // Graceful shutdown - cancel all jobs
  shutdown = () => {
    Object.keys(this.jobs).forEach((jobName) => {
      this.cancelJob(jobName);
    });
  };
}
