import { Prisma, Role } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { GetAttendanceHistoryDTO } from "./dto/attendance.dto";

@injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  public async ensureEmployeeIsClockedIn(
    authUserId: number,
    tx?: Prisma.TransactionClient,
  ) {
    const prismaClient = tx || this.prisma;
    const employee = await prismaClient.employee.findFirst({
      where: { userId: authUserId },
      include: { user: true },
    });

    if (!employee) {
      throw new ApiError("Employee not found", 404);
    }

    const currentAttendance = await prismaClient.attendance.findFirst({
      where: {
        employeeId: employee.id,
        clockOutAt: null,
      },
    });

    if (!currentAttendance) {
      throw new ApiError(
        "Action failed. You must clock in before performing this action.",
        403,
      );
    }
    return employee;
  }

  public clockIn = async (authUserId: number) => {
    return this.prisma.$transaction(async (tx) => {
      const employee = await this._getEmployeeByAuthId(authUserId, tx);

      const unclosedAttendance = await tx.attendance.findFirst({
        where: { employeeId: employee.id, clockOutAt: null },
        orderBy: { clockInAt: "desc" },
      });

      if (unclosedAttendance) {
        if (!unclosedAttendance.clockInAt) {
          throw new ApiError(
            "Invalid attendance record: missing clock-in time",
            500,
          );
        }

        const today = new Date();
        const clockInDate = new Date(unclosedAttendance.clockInAt);

        const isSameDay =
          today.getDate() === clockInDate.getDate() &&
          today.getMonth() === clockInDate.getMonth() &&
          today.getFullYear() === clockInDate.getFullYear();

        if (isSameDay) {
          throw new ApiError("Employee is already clocked in for today", 400);
        } else {
          const endOfPreviousDay = new Date(clockInDate);
          endOfPreviousDay.setHours(23, 59, 59, 999);
          await tx.attendance.update({
            where: { id: unclosedAttendance.id },
            data: { clockOutAt: endOfPreviousDay },
          });
        }
      }

      return tx.attendance.create({
        data: {
          employeeId: employee.id,
          clockInAt: new Date(),
          clockOutAt: null,
          outletId: employee.outletId,
        },
      });
    });
  };

  public clockOut = async (authUserId: number) => {
    return this.prisma.$transaction(async (tx) => {
      const employee = await this._getEmployeeByAuthId(authUserId, tx);

      const attendance = await tx.attendance.findFirst({
        where: { employeeId: employee.id, clockOutAt: null },
      });

      if (!attendance) {
        throw new ApiError("No active clock-in found to clock out", 404);
      }

      return tx.attendance.update({
        where: { id: attendance.id },
        data: { clockOutAt: new Date() },
      });
    });
  };

  public getCurrentAttendance = async (authUserId: number) => {
    const employee = await this._getEmployeeByAuthId(authUserId);
    return this.prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        clockOutAt: null,
      },
      include: {
        employee: { select: { id: true, userId: true } },
        outlet: { select: { id: true, outletName: true } },
      },
    });
  };

  public getAttendances = async (
    authUserId: number,
    dto: GetAttendanceHistoryDTO,
  ) => {
    const {
      page = 1,
      take = 10,
      sortBy = "clockInAt",
      sortOrder = "desc",
      all,
      ...filters
    } = dto;

    const user = await this.prisma.user.findUnique({
      where: { id: authUserId },
      include: { employees: true },
    });

    if (!user) {
      throw new ApiError("User not found", 404);
    }

    const allowedRoles = [Role.OUTLET_ADMIN, Role.DRIVER, Role.WORKER];

    const userRole = user.role as "OUTLET_ADMIN" | "DRIVER" | "WORKER";
    if (!allowedRoles.includes(userRole)) {
      throw new ApiError(
        "Access denied. Invalid role for attendance access",
        403,
      );
    }

    let employee = null;
    if (user.employees.length > 0) {
      employee = user.employees[0];
    } else {
      throw new ApiError(
        "Access denied. Employee record required for this role",
        403,
      );
    }

    const validatedFilters = {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    };

    const whereClause = this._createAttendanceWhereClause(
      user,
      employee,
      validatedFilters,
    );

    const findManyArgs: Prisma.AttendanceFindManyArgs = {
      where: whereClause,
      orderBy: { [sortBy]: sortOrder },
      include: {
        employee: {
          select: {
            id: true,
            outletId: true,
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
        outlet: { select: { id: true, outletName: true } },
      },
    };

    if (!all) {
      findManyArgs.skip = (page - 1) * take;
      findManyArgs.take = take;
    }

    const [attendanceData, count] = await this.prisma.$transaction([
      this.prisma.attendance.findMany(findManyArgs),
      this.prisma.attendance.count({ where: whereClause }),
    ]);

    return {
      data: attendanceData,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };

  public getTodayAttendance = async (authUserId: number) => {
    const user = await this.prisma.user.findUnique({
      where: { id: authUserId },
      select: { employees: { select: { id: true } } },
    });

    if (!user || user.employees.length === 0) {
      throw new ApiError("Employee not found for the current user", 404);
    }
    const employeeId = user.employees[0].id;

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    const todayAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId: employeeId,
        clockInAt: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        outlet: { select: { id: true, outletName: true } },
      },
    });

    let unclosedSessionFromPreviousDay = null;
    if (!todayAttendance) {
      unclosedSessionFromPreviousDay = await this.prisma.attendance.findFirst({
        where: {
          employeeId: employeeId,
          clockOutAt: null,
          clockInAt: { lt: startOfDay },
        },
        select: { id: true, clockInAt: true },
      });
    }

    const hasClockedIn = !!todayAttendance;
    const hasClockedOut = !!todayAttendance?.clockOutAt;

    return {
      data: todayAttendance,
      meta: {
        hasClockedIn,
        hasClockedOut,
        unclosedSession: unclosedSessionFromPreviousDay,
      },
    };
  };
  private async _getEmployeeByAuthId(
    authUserId: number,
    tx?: Prisma.TransactionClient,
  ) {
    const prismaClient = tx || this.prisma;
    const employee = await prismaClient.employee.findFirst({
      where: { userId: authUserId },
    });
    if (!employee) {
      throw new ApiError("Employee not found", 404);
    }
    return employee;
  }

  private _createAttendanceWhereClause(
    user: { role: Role },
    employee: { id: number; outletId: number | null },
    filters: {
      search?: string;
      startDate?: Date;
      endDate?: Date;
      employeeId?: number;
    },
  ): Prisma.AttendanceWhereInput {
    const { search, startDate, endDate, employeeId } = filters;
    const whereClause: Prisma.AttendanceWhereInput = {};

    if (user.role === Role.OUTLET_ADMIN) {
      if (employee.outletId === null) {
        throw new ApiError("Current user is not assigned to any outlet.", 403);
      }
      whereClause.outletId = employee.outletId;
      if (employeeId) whereClause.employeeId = employeeId;
    } else if (user.role === Role.DRIVER || user.role === Role.WORKER) {
      whereClause.employeeId = employee.id;
    } else {
      throw new ApiError(
        "Access denied. Invalid role for attendance access",
        403,
      );
    }

    if (search && user.role === Role.OUTLET_ADMIN) {
      whereClause.employee = {
        user: {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
      };
    }

    if (startDate || endDate) {
      whereClause.clockInAt = {};
      if (startDate) whereClause.clockInAt.gte = startDate;
      if (endDate) {
        const endOfSelectedDay = new Date(endDate);
        endOfSelectedDay.setHours(23, 59, 59, 999);
        whereClause.clockInAt.lte = endOfSelectedDay;
      }
    }

    if (user.role === Role.OUTLET_ADMIN) {
      // Outlet admin hanya bisa lihat attendance driver, worker, dan outlet admin lain di outlet yang sama
      const permittedRoles: Role[] = [
        Role.DRIVER,
        Role.WORKER,
        Role.OUTLET_ADMIN,
      ];
      const roleFilter = { user: { role: { in: permittedRoles } } };

      if (whereClause.employee) {
        whereClause.employee = {
          AND: [whereClause.employee, roleFilter],
        };
      } else {
        whereClause.employee = roleFilter;
      }
    }

    return whereClause;
  }
}
