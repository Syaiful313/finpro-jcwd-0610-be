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

  clockIn = async (authUserId: number) => {
    const result = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { userId: authUserId },
      });

      if (!employee) {
        throw new ApiError("Employee not found", 404);
      }

      const alreadyClockedIn = await tx.attendance.findFirst({
        where: {
          employeeId: employee.id,
          outletId: employee.outletId,
          clockOutAt: null,
        },
      });

      if (alreadyClockedIn) {
        throw new ApiError("Employee is already clocked in", 400);
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

  //   for worker/driver
  getAttendanceHistory = async (
    authUserId: number,
    dto: GetAttendanceHistoryDTO,
  ) => {
    const {
      page,
      take,
      sortBy = "clockInAt",
      sortOrder = "desc",
      all,
      startDate,
      endDate,
    } = dto;

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: authUserId,
      },
    });

    if (!employee) {
      throw new ApiError("Employee not found", 404);
    }

    const whereClause: Prisma.AttendanceWhereInput = {
      employeeId: employee.id,
    };

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

    const history = await this.prisma.attendance.findMany({
      where: whereClause,
      orderBy: { [sortBy]: sortOrder },
      ...paginationArgs,
      include: {
        employee: {
          select: {
            id: true,
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
      data: history,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };

  //   for admin
  getAttendanceReport = async (
    authUserId: number,
    dto: GetAttendanceReportDTO,
  ) => {
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
          include: {
            outlet: true,
          },
        },
      },
    });

    if (!user || user.employees.length === 0) {
      throw new ApiError("Employee not found", 404);
    }

    if (user.role !== "OUTLET_ADMIN" && user.role !== "ADMIN") {
      throw new ApiError(
        "Access denied. Only outlet admin can view attendance reports",
        403,
      );
    }

    const currentEmployee = user.employees[0];
    const outletId = currentEmployee.outletId;

    const whereClause: Prisma.AttendanceWhereInput = {
      outletId: outletId,
    };

    if (employeeId) {
      whereClause.employeeId = employeeId;
    }

    const userConditions: Prisma.UserWhereInput = {
      role: {
        in: ["DRIVER", "WORKER"],
      },
    };

    if (search) {
      userConditions.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    if (search) {
      userConditions.AND = [
        {
          role: { in: ["DRIVER", "WORKER", "OUTLET_ADMIN"] },
        },
        {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
      ];
      delete userConditions.role;
    }

    whereClause.employee = {
      user: userConditions,
    };

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

    const attendanceReport = await this.prisma.attendance.findMany({
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
      data: attendanceReport,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };

  getAttendances = async (authUserId: number, dto: GetAttendanceHistoryDTO) => {
    const {
      page = 1,
      take = 10,
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
          include: {
            outlet: true,
          },
        },
      },
    });

    if (!user || user.employees.length === 0) {
      throw new ApiError("Employee not found", 404);
    }

    const currentEmployee = user.employees[0];

    const whereClause: Prisma.AttendanceWhereInput = {};

    // Role-based access control
    if (user.role === "OUTLET_ADMIN" || user.role === "ADMIN") {
      whereClause.outletId = currentEmployee.outletId;

      // If specific employee is requested
      if (employeeId) {
        whereClause.employeeId = employeeId;
      }

      // Search functionality for admin
      if (search) {
        whereClause.employee = {
          user: {
            AND: [
              {
                role: { in: ["DRIVER", "WORKER", "OUTLET_ADMIN", "ADMIN"] },
              },
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

      if (whereClause.employee) {
        delete whereClause.employee;
      }
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

    // Get attendance data
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
