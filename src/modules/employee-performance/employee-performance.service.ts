import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { GetEmployeePerformanceDTO } from "./dto/get-employee-performance.dto";

interface WorkerPerformance {
  employeeId: number;
  employeeName: string;
  outletName: string;
  outletId: number;
  role: string;
  totalWashingJobs: number;
  totalIroningJobs: number;
  totalPackingJobs: number;
  totalJobs: number;
  completedJobs: number;
  completionRate: number;
}

interface DriverPerformance {
  employeeId: number;
  employeeName: string;
  outletName: string;
  outletId: number;
  role: string;
  totalPickupJobs: number;
  totalDeliveryJobs: number;
  totalJobs: number;
  completedJobs: number;
  completionRate: number;
}

@injectable()
export class EmployeePerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  getEmployeePerformance = async (
    dto: GetEmployeePerformanceDTO,
    userRole: string,
    userOutletId?: number,
  ) => {
    const {
      page,
      take,
      sortBy = "totalJobs",
      sortOrder,
      all,
      outletId,
      startDate,
      endDate,
      employeeId,
      role,
    } = dto;

    const allowedOutletIds = this.getAuthorizedOutletIds(
      userRole,
      userOutletId,
      outletId,
    );

    const dateFilter = this.buildDateFilter(startDate, endDate);

    let allEmployeeData: (WorkerPerformance | DriverPerformance)[] = [];

    if (!role || role === "WORKER") {
      const workerPerformance = await this.getWorkerPerformance(
        allowedOutletIds,
        dateFilter,
        employeeId,
      );
      allEmployeeData = [...allEmployeeData, ...workerPerformance];
    }

    if (!role || role === "DRIVER") {
      const driverPerformance = await this.getDriverPerformance(
        allowedOutletIds,
        dateFilter,
        employeeId,
      );
      allEmployeeData = [...allEmployeeData, ...driverPerformance];
    }

    const sortedData = this.sortEmployeeData(
      allEmployeeData,
      sortBy,
      sortOrder,
    );

    let paginationArgs: { skip?: number; take?: number } = {};
    const count = sortedData.length;

    if (!all) {
      const skip = (page - 1) * take;
      sortedData.splice(0, skip);
      sortedData.splice(take);
      paginationArgs = { skip, take };
    }

    const summary = this.calculateSummary(allEmployeeData);

    return {
      data: sortedData,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
      summary,
    };
  };

  private getAuthorizedOutletIds = (
    userRole: string,
    userOutletId?: number,
    requestedOutletId?: number,
  ): number[] => {
    if (userRole === "ADMIN") {
      return requestedOutletId ? [requestedOutletId] : [];
    } else if (userRole === "OUTLET_ADMIN" && userOutletId) {
      if (requestedOutletId && requestedOutletId !== userOutletId) {
        throw new ApiError("You can only access your outlet's data", 403);
      }
      return [userOutletId];
    }
    throw new ApiError("Unauthorized access", 403);
  };

  private buildDateFilter = (startDate?: string, endDate?: string) => {
    const dateFilter: any = {};

    if (startDate && endDate) {
      dateFilter.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else if (startDate) {
      dateFilter.createdAt = {
        gte: new Date(startDate),
      };
    } else if (endDate) {
      dateFilter.createdAt = {
        lte: new Date(endDate),
      };
    }

    return dateFilter;
  };

  private getWorkerPerformance = async (
    outletIds: number[],
    dateFilter: any,
    employeeId?: number,
  ): Promise<WorkerPerformance[]> => {
    const whereClause: any = {
      employee: {
        deletedAt: null,
        user: {
          role: { in: ["WORKER"] },
          deletedAt: null,
        },
      },
      ...dateFilter,
    };

    if (outletIds.length > 0) {
      whereClause.employee = {
        ...whereClause.employee,
        outletId: { in: outletIds },
      };
    }

    if (employeeId) {
      whereClause.employeeId = employeeId;
    }

    const orderWorkProcesses = await this.prisma.orderWorkProcess.findMany({
      where: whereClause,
      include: {
        employee: {
          include: {
            user: true,
            outlet: true,
          },
        },
      },
    });

    const employeeMap = new Map<number, any>();

    orderWorkProcesses.forEach((process) => {
      const employeeId = process.employee.id;

      if (!employeeMap.has(employeeId)) {
        employeeMap.set(employeeId, {
          employeeId,
          employeeName: `${process.employee.user.firstName} ${process.employee.user.lastName}`,
          outletName: process.employee.outlet.outletName,
          outletId: process.employee.outletId,
          role: "WORKER",
          washing: 0,
          ironing: 0,
          packing: 0,
          completed: 0,
          total: 0,
        });
      }

      const employee = employeeMap.get(employeeId);
      employee.total++;

      if (process.workerType === "WASHING") employee.washing++;
      else if (process.workerType === "IRONING") employee.ironing++;
      else if (process.workerType === "PACKING") employee.packing++;

      if (process.completedAt) employee.completed++;
    });

    return Array.from(employeeMap.values()).map((employee) => ({
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      outletName: employee.outletName,
      outletId: employee.outletId,
      role: employee.role,
      totalWashingJobs: employee.washing,
      totalIroningJobs: employee.ironing,
      totalPackingJobs: employee.packing,
      totalJobs: employee.total,
      completedJobs: employee.completed,
      completionRate:
        employee.total > 0 ? (employee.completed / employee.total) * 100 : 0,
    }));
  };

  private getDriverPerformance = async (
    outletIds: number[],
    dateFilter: any,
    employeeId?: number,
  ): Promise<DriverPerformance[]> => {
    const whereClause: any = {
      employee: {
        deletedAt: null,
        user: {
          role: { in: ["DRIVER"] },
          deletedAt: null,
        },
      },
      ...dateFilter,
    };

    if (outletIds.length > 0) {
      whereClause.employee = {
        ...whereClause.employee,
        outletId: { in: outletIds },
      };
    }

    if (employeeId) {
      whereClause.employeeId = employeeId;
    }

    const pickupJobs = await this.prisma.pickUpJob.findMany({
      where: whereClause,
      include: {
        employee: {
          include: {
            user: true,
            outlet: true,
          },
        },
      },
    });

    const deliveryJobs = await this.prisma.deliveryJob.findMany({
      where: whereClause,
      include: {
        employee: {
          include: {
            user: true,
            outlet: true,
          },
        },
      },
    });

    const employeeMap = new Map<number, any>();

    pickupJobs.forEach((job) => {
      if (!job.employee) return;

      const employeeId = job.employee.id;

      if (!employeeMap.has(employeeId)) {
        employeeMap.set(employeeId, {
          employeeId,
          employeeName: `${job.employee.user.firstName} ${job.employee.user.lastName}`,
          outletName: job.employee.outlet.outletName,
          outletId: job.employee.outletId,
          role: "DRIVER",
          pickup: 0,
          delivery: 0,
          pickupCompleted: 0,
          deliveryCompleted: 0,
        });
      }

      const employee = employeeMap.get(employeeId);
      employee.pickup++;
      if (job.status === "COMPLETED") employee.pickupCompleted++;
    });

    deliveryJobs.forEach((job) => {
      if (!job.employee) return;

      const employeeId = job.employee.id;

      if (!employeeMap.has(employeeId)) {
        employeeMap.set(employeeId, {
          employeeId,
          employeeName: `${job.employee.user.firstName} ${job.employee.user.lastName}`,
          outletName: job.employee.outlet.outletName,
          outletId: job.employee.outletId,
          role: "DRIVER",
          pickup: 0,
          delivery: 0,
          pickupCompleted: 0,
          deliveryCompleted: 0,
        });
      }

      const employee = employeeMap.get(employeeId);
      employee.delivery++;
      if (job.status === "COMPLETED") employee.deliveryCompleted++;
    });

    return Array.from(employeeMap.values()).map((employee) => {
      const totalJobs = employee.pickup + employee.delivery;
      const completedJobs =
        employee.pickupCompleted + employee.deliveryCompleted;

      return {
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        outletName: employee.outletName,
        outletId: employee.outletId,
        role: employee.role,
        totalPickupJobs: employee.pickup,
        totalDeliveryJobs: employee.delivery,
        totalJobs,
        completedJobs,
        completionRate: totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0,
      };
    });
  };

  private sortEmployeeData = (
    data: (WorkerPerformance | DriverPerformance)[],
    sortBy: string,
    sortOrder: "asc" | "desc" = "desc",
  ) => {
    return data.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy) {
        case "employeeName":
          aValue = a.employeeName.toLowerCase();
          bValue = b.employeeName.toLowerCase();
          break;
        case "outletName":
          aValue = a.outletName.toLowerCase();
          bValue = b.outletName.toLowerCase();
          break;
        case "completionRate":
          aValue = a.completionRate;
          bValue = b.completionRate;
          break;
        case "totalJobs":
        default:
          aValue = a.totalJobs;
          bValue = b.totalJobs;
          break;
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  };

  private calculateSummary = (
    data: (WorkerPerformance | DriverPerformance)[],
  ) => {
    const workers = data.filter((emp) => emp.role === "WORKER");
    const drivers = data.filter((emp) => emp.role === "DRIVER");

    const totalCompletionRate =
      data.length > 0
        ? data.reduce((sum, emp) => sum + emp.completionRate, 0) / data.length
        : 0;

    return {
      totalEmployees: data.length,
      totalWorkers: workers.length,
      totalDrivers: drivers.length,
      averageCompletionRate: Math.round(totalCompletionRate * 100) / 100,
    };
  };
}
