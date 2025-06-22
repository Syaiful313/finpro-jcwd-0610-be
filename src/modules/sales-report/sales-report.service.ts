import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  GetOutletComparisonDTO,
  GetSalesReportDTO,
  ReportPeriod,
} from "./dto/get-sales-report.dto";

export interface IncomeData {
  period: string;
  totalIncome: number;
  totalOrders: number;
  outletId?: number;
  outletName?: string;
}

export interface OutletComparisonData {
  outletId: number;
  outletName: string;
  totalIncome: number;
  totalOrders: number;
  averageOrderValue: number;
}

export interface SalesReportSummary {
  totalIncome: number;
  totalOrders: number;
  averageOrderValue: number;
}

@injectable()
export class SalesReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  private buildOrderWhereClause(
    dto: GetSalesReportDTO,
    userRole: string,
    userOutletId?: number,
  ): Prisma.OrderWhereInput {
    const { startDate, endDate, outletId } = dto;

    const whereClause: Prisma.OrderWhereInput = {
      orderStatus: "COMPLETED",
      paymentStatus: "PAID",
      totalPrice: { not: null },
    };

    if (userRole === "OUTLET_ADMIN") {
      whereClause.outletId = userOutletId;
    } else if (userRole === "ADMIN" && outletId) {
      whereClause.outletId = outletId;
    }

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        whereClause.createdAt.lte = new Date(endDate);
      }
    }

    return whereClause;
  }

  private groupOrdersByPeriod(
    orders: any[],
    period: ReportPeriod,
  ): IncomeData[] {
    const grouped = new Map<
      string,
      { totalIncome: number; totalOrders: number }
    >();

    orders.forEach((order) => {
      const date = new Date(order.createdAt);
      let periodKey: string;

      switch (period) {
        case ReportPeriod.DAILY:
          periodKey = date.toISOString().split("T")[0];
          break;
        case ReportPeriod.MONTHLY:
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          break;
        case ReportPeriod.YEARLY:
          periodKey = String(date.getFullYear());
          break;
        default:
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      }

      if (!grouped.has(periodKey)) {
        grouped.set(periodKey, { totalIncome: 0, totalOrders: 0 });
      }

      const existing = grouped.get(periodKey)!;
      existing.totalIncome += order.totalPrice || 0;
      existing.totalOrders += 1;
    });

    return Array.from(grouped.entries())
      .map(([period, data]) => ({
        period,
        totalIncome: data.totalIncome,
        totalOrders: data.totalOrders,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  private calculateSummary(groupedData: IncomeData[]): SalesReportSummary {
    const totalIncome = groupedData.reduce(
      (sum, item) => sum + item.totalIncome,
      0,
    );
    const totalOrders = groupedData.reduce(
      (sum, item) => sum + item.totalOrders,
      0,
    );
    const averageOrderValue =
      totalOrders > 0 ? Math.round((totalIncome / totalOrders) * 100) / 100 : 0;

    return {
      totalIncome,
      totalOrders,
      averageOrderValue,
    };
  }

  getSalesReport = async (
    dto: GetSalesReportDTO,
    userRole: string,
    userOutletId?: number,
  ) => {
    const { period = ReportPeriod.MONTHLY, page = 1, take = 10, all } = dto;

    const whereClause = this.buildOrderWhereClause(dto, userRole, userOutletId);

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      select: {
        totalPrice: true,
        createdAt: true,
        outletId: true,
        outlet: {
          select: {
            outletName: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const groupedData = this.groupOrdersByPeriod(orders, period);

    const summary = this.calculateSummary(groupedData);

    const count = groupedData.length;
    let paginatedData: IncomeData[];

    if (all) {
      paginatedData = groupedData;
    } else {
      const skip = (page - 1) * take;
      paginatedData = groupedData.slice(skip, skip + take);
    }

    return {
      data: paginatedData,
      summary,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };

  getTotalIncome = async (
    userRole: string,
    userOutletId?: number,
    filterOutletId?: number,
  ) => {
    const whereClause: Prisma.OrderWhereInput = {
      orderStatus: "COMPLETED",
      paymentStatus: "PAID",
      totalPrice: { not: null },
    };

    if (userRole === "OUTLET_ADMIN") {
      whereClause.outletId = userOutletId;
    } else if (userRole === "ADMIN" && filterOutletId) {
      whereClause.outletId = filterOutletId;
    }

    const result = await this.prisma.order.aggregate({
      where: whereClause,
      _sum: { totalPrice: true },
      _count: { uuid: true },
    });

    const totalIncome = result._sum?.totalPrice || 0;
    const totalOrders = result._count?.uuid || 0;

    return {
      totalIncome,
      totalOrders,
      averageOrderValue:
        totalOrders > 0
          ? Math.round((totalIncome / totalOrders) * 100) / 100
          : 0,
    };
  };

  getOutletComparison = async (dto: GetOutletComparisonDTO) => {
    const { startDate, endDate, page = 1, take = 20, all } = dto;

    const orderWhereClause: Prisma.OrderWhereInput = {
      orderStatus: "COMPLETED",
      paymentStatus: "PAID",
      totalPrice: { not: null },
    };

    if (startDate || endDate) {
      orderWhereClause.createdAt = {};
      if (startDate) {
        orderWhereClause.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        orderWhereClause.createdAt.lte = new Date(endDate);
      }
    }

    const outlets = await this.prisma.outlet.findMany({
      where: {
        deletedAt: null,
        isActive: true,
      },
      include: {
        orders: {
          where: orderWhereClause,
          select: {
            totalPrice: true,
            uuid: true,
          },
        },
      },
    });

    const outletComparison: OutletComparisonData[] = outlets.map(
      (outlet: any) => {
        const totalIncome = outlet.orders.reduce(
          (sum: number, order: any) => sum + (order.totalPrice || 0),
          0,
        );
        const totalOrders = outlet.orders.length;
        const averageOrderValue =
          totalOrders > 0
            ? Math.round((totalIncome / totalOrders) * 100) / 100
            : 0;

        return {
          outletId: outlet.id,
          outletName: outlet.outletName,
          totalIncome,
          totalOrders,
          averageOrderValue,
        };
      },
    );

    const sortedData = outletComparison.sort(
      (a, b) => b.totalIncome - a.totalIncome,
    );

    const count = sortedData.length;
    let paginatedData: OutletComparisonData[];

    if (all) {
      paginatedData = sortedData;
    } else {
      const skip = (page - 1) * take;
      paginatedData = sortedData.slice(skip, skip + take);
    }

    return {
      data: paginatedData,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };
}
