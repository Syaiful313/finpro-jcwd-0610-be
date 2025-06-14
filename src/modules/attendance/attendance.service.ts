import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  GetAttendanceHistoryDTO,
  GetAttendanceReportDTO,
} from "./dto/attendance.dto";
import { Prisma } from "@prisma/client";

@injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  // clockIn = async (authUserId: number) => {
  //   const result = await this.prisma.$transaction(async (tx) => {
  //     const employee = await tx.employee.findFirst({
  //       where: { userId: authUserId },
  //     });

  //     if (!employee) {
  //       throw new ApiError("Employee not found", 404);
  //     }

  //     const uncloseAttendance = await tx.attendance.findFirst({
  //       where: {
  //         employeeId: employee.id,
  //         outletId: employee.outletId,
  //         clockOutAt: null,
  //       },
  //       orderBy: {
  //         clockInAt: "desc",
  //       },
  //     });

  //     if (uncloseAttendance) {
  //       const today = new Date();

  //       if (!uncloseAttendance.clockInAt) {
  //         throw new ApiError(
  //           "Invalid attendance record: missing clock-in time",
  //           500,
  //         );
  //       }

  //       const clockInDate = new Date(uncloseAttendance.clockInAt);

  //       const isFromPreviousDay =
  //         today.getDate() !== clockInDate.getDate() ||
  //         today.getMonth() !== clockInDate.getMonth() ||
  //         today.getFullYear() !== clockInDate.getFullYear();

  //       if (isFromPreviousDay) {
  //         const endOfPreviousDay = new Date(clockInDate);
  //         endOfPreviousDay.setHours(23, 59, 59, 999);

  //         await tx.attendance.update({
  //           where: { id: uncloseAttendance.id },
  //           data: {
  //             clockOutAt: endOfPreviousDay,
  //           },
  //         });
  //       } else {
  //         throw new ApiError("Employee is already clocked in", 400);
  //       }
  //     }

  //     const attendance = await tx.attendance.create({
  //       data: {
  //         employeeId: employee.id,
  //         clockInAt: new Date(),
  //         clockOutAt: null,
  //         outletId: employee.outletId,
  //       },
  //     });

  //     return attendance;
  //   });
  //   return result;
  // };

  // clockOut = async (authUserId: number) => {
  //   const result = await this.prisma.$transaction(async (tx) => {
  //     const employee = await tx.employee.findFirst({
  //       where: {
  //         userId: authUserId,
  //       },
  //     });

  //     if (!employee) {
  //       throw new ApiError("Employee not found", 404);
  //     }

  //     const attendance = await tx.attendance.findFirst({
  //       where: {
  //         employeeId: employee.id,
  //         clockOutAt: null,
  //       },
  //     });

  //     if (!attendance) {
  //       throw new ApiError("No active clock-in found", 404);
  //     }

  //     const updated = await tx.attendance.update({
  //       where: {
  //         id: attendance.id,
  //         clockOutAt: null,
  //       },
  //       data: {
  //         clockOutAt: new Date(),
  //       },
  //     });

  //     return updated;
  //   });

  //   return result;
  // };

  clockIn = async (authUserId: number) => {
    const result = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { userId: authUserId },
      });

      if (!employee) {
        throw new ApiError("Employee not found", 404);
      }

      const uncloseAttendance = await tx.attendance.findFirst({
        where: {
          employeeId: employee.id,
          outletId: employee.outletId,
          clockOutAt: null,
        },
        orderBy: {
          clockInAt: "desc",
        },
      });

      if (uncloseAttendance) {
        if (!uncloseAttendance.clockInAt) {
          throw new ApiError(
            "Invalid attendance record: missing clock-in time",
            500,
          );
        }

        const today = new Date();
        const clockInDate = new Date(uncloseAttendance.clockInAt);

        // Check if it's the same day
        const isSameDay =
          today.getDate() === clockInDate.getDate() &&
          today.getMonth() === clockInDate.getMonth() &&
          today.getFullYear() === clockInDate.getFullYear();

        if (isSameDay) {
          throw new ApiError("Employee is already clocked in", 400);
        } else {
          // Auto close previous attendance at end of that day
          const endOfPreviousDay = new Date(clockInDate);
          endOfPreviousDay.setHours(23, 59, 59, 999);

          await tx.attendance.update({
            where: { id: uncloseAttendance.id },
            data: {
              clockOutAt: endOfPreviousDay,
            },
          });
        }
      }

      const attendance = await tx.attendance.create({
        data: {
          employeeId: employee.id,
          clockInAt: new Date(),
          clockOutAt: null,
          outletId: employee.outletId,
        },
      });

      return attendance;
    });
    return result;
  };

  clockOut = async (authUserId: number) => {
    const result = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: {
          userId: authUserId,
        },
      });

      if (!employee) {
        throw new ApiError("Employee not found", 404);
      }

      const attendance = await tx.attendance.findFirst({
        where: {
          employeeId: employee.id,
          clockOutAt: null,
        },
      });

      if (!attendance) {
        throw new ApiError("No active clock-in found", 404);
      }

      const updated = await tx.attendance.update({
        where: {
          id: attendance.id,
          clockOutAt: null,
        },
        data: {
          clockOutAt: new Date(),
        },
      });

      return updated;
    });

    return result;
  };

  getAttendanceHistory = async (
    authUserId: number,
    startDate?: Date,
    endDate?: Date,
  ) => {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
    });

    if (!employee) {
      throw new ApiError("Employee not found", 404);
    }

    const whereClause: any = {
      employeeId: employee.id,
    };

    if (startDate && endDate) {
      whereClause.clockInAt = {
        gte: startDate,
        lte: endDate,
      };
    }

    return this.prisma.attendance.findMany({
      where: whereClause,
      orderBy: {
        clockInAt: "desc",
      },
      include: {
        employee: {
          select: {
            id: true,
            userId: true,
          },
        },
        outlet: {
          select: {
            id: true,
            outletName: true,
          },
        },
      },
    });
  };

  getCurrentAttendance = async (authUserId: number) => {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: authUserId },
    });

    if (!employee) {
      throw new ApiError("Employee not found", 404);
    }

    return this.prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        clockOutAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            userId: true,
          },
        },
        outlet: {
          select: {
            id: true,
            outletName: true,
          },
        },
      },
    });
  };

  getAttendances = async (authUserId: number, dto: GetAttendanceHistoryDTO) => {
    const {
      page,
      take,
      sortBy = "clockInAt",
      sortOrder = "desc",
      all,
      search,
      startDate,
      endDate,
      employeeId,
    } = dto;

    const user = await this.prisma.user.findFirst({
      where: { id: authUserId },
      include: {
        employees: {
          include: { outlet: true },
        },
      },
    });

    if (!user || user.employees.length === 0) {
      throw new ApiError("Employee not found", 404);
    }

    const currentEmployee = user.employees[0];
    const whereClause: Prisma.AttendanceWhereInput = {};

    if (user.role === "ADMIN") {
      if (employeeId) {
        whereClause.employeeId = employeeId;
      }

      if (search) {
        whereClause.employee = {
          user: {
            AND: [
              { role: { in: ["DRIVER", "WORKER", "OUTLET_ADMIN", "ADMIN"] } },
              {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              },
            ],
          },
        };
      } else {
        whereClause.employee = {
          user: {
            role: { in: ["DRIVER", "WORKER", "OUTLET_ADMIN", "ADMIN"] },
          },
        };
      }
    } else if (user.role === "OUTLET_ADMIN") {
      whereClause.outletId = currentEmployee.outletId;

      if (employeeId) {
        whereClause.employeeId = employeeId;
      }

      if (search) {
        whereClause.employee = {
          user: {
            AND: [
              { role: { in: ["DRIVER", "WORKER", "OUTLET_ADMIN", "ADMIN"] } },
              {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              },
            ],
          },
        };
      } else {
        whereClause.employee = {
          user: {
            role: { in: ["DRIVER", "WORKER", "OUTLET_ADMIN", "ADMIN"] },
          },
        };
      }
    } else if (user.role === "DRIVER" || user.role === "WORKER") {
      whereClause.employeeId = currentEmployee.id;
    } else {
      throw new ApiError(
        "Access denied. Invalid role for attendance access",
        403,
      );
    }

    // Date filtering
    if (startDate || endDate) {
      whereClause.clockInAt = {};

      if (startDate) {
        whereClause.clockInAt.gte = new Date(startDate);
      }

      if (endDate) {
        const endOfSelectedDay = new Date(endDate);
        endOfSelectedDay.setHours(23, 59, 59, 999);
        whereClause.clockInAt.lte = endOfSelectedDay;
      }
    }

    let paginationArgs: Prisma.AttendanceFindManyArgs = {};
    if (!all) {
      paginationArgs = {
        skip: (page - 1) * take,
        take,
      };
    }

    const attendanceData = await this.prisma.attendance.findMany({
      where: whereClause,
      orderBy: { [sortBy]: sortOrder },
      ...paginationArgs,
      include: {
        employee: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
        },
        outlet: {
          select: {
            id: true,
            outletName: true,
          },
        },
      },
    });

    const count = await this.prisma.attendance.count({ where: whereClause });

    return {
      data: attendanceData,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };
}
