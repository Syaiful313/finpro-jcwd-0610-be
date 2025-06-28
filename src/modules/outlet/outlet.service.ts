import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOutletDTO } from "./dto/create-outlet.dto";
import { GetOutletsDTO } from "./dto/get-outlets.dto";
import { UpdateOutletDTO } from "./dto/update-outlet.dto";

@injectable()
export class OutletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  getOutlets = async (dto: GetOutletsDTO) => {
    const { page, take, sortBy, sortOrder, all, search, isActive } = dto;

    const whereClause: Prisma.OutletWhereInput = {
      deletedAt: null,
    };

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
            employees: {
              where: { deletedAt: null },
            },
            orders: true,
            users: {
              where: { deletedAt: null },
            },
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

  createOutlet = async (body: CreateOutletDTO) => {
    const {
      outletName,
      address,
      latitude,
      longitude,
      serviceRadius,
      isActive = true,
    } = body;

    const existingOutlet = await this.prisma.outlet.findFirst({
      where: {
        outletName: {
          equals: outletName,
          mode: "insensitive",
        },
      },
    });

    if (existingOutlet) {
      throw new ApiError("Outlet dengan nama tersebut sudah ada", 400);
    }

    const result = await this.prisma.outlet.create({
      data: {
        outletName,
        address,
        latitude,
        longitude,
        serviceRadius,
        isActive,
      },
    });

    return {
      success: true,
      message: "Outlet berhasil dibuat",
      data: result,
    };
  };

  updateOutlet = async (outletId: number, body: UpdateOutletDTO) => {
    const {
      outletName,
      address,
      latitude,
      longitude,
      serviceRadius,
      isActive,
    } = body;

    const existingOutlet = await this.prisma.outlet.findUnique({
      where: { id: outletId },
    });

    if (!existingOutlet) {
      throw new ApiError("Outlet tidak ditemukan", 404);
    }

    if (outletName && outletName !== existingOutlet.outletName) {
      const duplicateOutlet = await this.prisma.outlet.findFirst({
        where: {
          outletName: {
            equals: outletName,
            mode: "insensitive",
          },
          id: {
            not: outletId,
          },
        },
      });

      if (duplicateOutlet) {
        throw new ApiError("Outlet dengan nama tersebut sudah ada", 400);
      }
    }

    const updateData: any = {};

    if (outletName !== undefined) updateData.outletName = outletName;
    if (address !== undefined) updateData.address = address;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;
    if (serviceRadius !== undefined) updateData.serviceRadius = serviceRadius;
    if (isActive !== undefined) updateData.isActive = isActive;

    const result = await this.prisma.outlet.update({
      where: { id: outletId },
      data: updateData,
    });

    return {
      success: true,
      message: "Outlet berhasil diupdate",
      data: result,
    };
  };

  deleteOutlet = async (outletId: number) => {
    const result = await this.prisma.$transaction(async (tx) => {
      const deletedOutlet = await tx.outlet.update({
        where: { id: outletId },
        data: { deletedAt: new Date(), isActive: false },
      });

      await tx.employee.updateMany({
        where: {
          outletId: outletId,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });

      await tx.order.updateMany({
        where: {
          outletId: outletId,
        },
        data: { updatedAt: new Date() },
      });

      await tx.user.updateMany({
        where: {
          outletId: outletId,
          deletedAt: null,
        },
        data: {
          outletId: null,
          updatedAt: new Date(),
        },
      });

      return deletedOutlet;
    });

    return {
      success: true,
      message: "Outlet berhasil dihapus",
      data: {
        id: result.id,
        outletName: result.outletName,
        address: result.address,
        deletedAt: result.deletedAt,
      },
    };
  };
}
