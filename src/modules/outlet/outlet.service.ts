import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { GetOutletsDTO } from "./dto/get-outlets.dto";

@injectable()
export class OutletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  getAllOutlets = async (
    dto: GetOutletsDTO,
    currentUser?: { id: number; role: string; outletId?: number }
  ) => {
    const { page, take, sortBy, sortOrder, all, search, isActive } = dto;

    const whereClause: Prisma.OutletWhereInput = {
      isActive: isActive !== undefined ? isActive : true,
    };

    // Role-based filtering
    if (currentUser?.role === "OUTLET_ADMIN") {
      // OUTLET_ADMIN hanya bisa lihat outlet mereka sendiri
      const employeeData = await this.prisma.employee.findFirst({
        where: { userId: currentUser.id },
        select: { outletId: true },
      });

      if (employeeData) {
        whereClause.id = employeeData.outletId;
      } else {
        // Jika tidak ada employee data, return empty result
        return {
          data: [],
          meta: this.paginationService.generateMeta({
            page,
            take: all ? 0 : take,
            count: 0,
          }),
        };
      }
    }

    if (search) {
      whereClause.OR = [
        {
          outletName: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          address: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    let paginationArgs: Prisma.OutletFindManyArgs = {};

    if (!all) {
      paginationArgs = {
        skip: (page - 1) * take,
        take,
      };
    }

    const outlets = await this.prisma.outlet.findMany({
      where: whereClause,
      orderBy: { [sortBy]: sortOrder },
      ...paginationArgs,
      select: {
        id: true,
        outletName: true,
        address: true,
        latitude: true,
        longitude: true,
        serviceRadius: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,

        _count: {
          select: {
            employees: true,
            orders: true,
          },
        },
      },
    });

    const count = await this.prisma.outlet.count({
      where: whereClause,
    });

    return {
      data: outlets,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };
}