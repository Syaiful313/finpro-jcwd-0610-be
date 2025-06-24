import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLaundryItemDTO } from "./dto/create-loundry-item.dto";
import { GetLaundryItemsDTO } from "./dto/get-laundry-items.dto";
import { UpdateLaundryItemDTO } from "./dto/update-laundry-item.dto";

@injectable()
export class LaundryItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  getLaundryItems = async (dto: GetLaundryItemsDTO) => {
    const {
      page,
      take,
      sortBy,
      sortOrder,
      all,
      search,
      isActive,
      category,
      pricingType,
    } = dto;

    const whereClause: Prisma.LaundryItemWhereInput = {
      deletedAt: null,
    };

    if (search) {
      whereClause.OR = [
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          category: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    if (category) {
      whereClause.category = {
        contains: category,
        mode: "insensitive",
      };
    }

    if (pricingType) {
      whereClause.pricingType = pricingType;
    }

    let paginationArgs: Prisma.LaundryItemFindManyArgs = {};

    if (!all) {
      paginationArgs = {
        skip: (page - 1) * take,
        take,
      };
    }

    const laundryItems = await this.prisma.laundryItem.findMany({
      where: whereClause,
      orderBy: { [sortBy]: sortOrder },
      ...paginationArgs,
      select: {
        id: true,
        name: true,
        category: true,
        basePrice: true,
        pricingType: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,

        _count: {
          select: {
            orderItems: true,
          },
        },
      },
    });

    const count = await this.prisma.laundryItem.count({
      where: whereClause,
    });

    return {
      data: laundryItems,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };

  createLaundryItem = async (body: CreateLaundryItemDTO) => {
    const { name, category, basePrice, pricingType, isActive = true } = body;

    const existingLaundryItem = await this.prisma.laundryItem.findFirst({
      where: {
        name: {
          equals: name,
          mode: "insensitive",
        },
        deletedAt: null,
      },
    });

    if (existingLaundryItem) {
      throw new ApiError("Item laundry dengan nama tersebut sudah ada", 400);
    }

    const result = await this.prisma.laundryItem.create({
      data: {
        name,
        category,
        basePrice,
        pricingType,
        isActive,
      },
      select: {
        id: true,
        name: true,
        category: true,
        basePrice: true,
        pricingType: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: "Item laundry berhasil dibuat",
      data: result,
    };
  };

  updateLaundryItem = async (
    laundryItemId: number,
    body: UpdateLaundryItemDTO,
  ) => {
    const { name, category, basePrice, pricingType, isActive } = body;

    const existingLaundryItem = await this.prisma.laundryItem.findUnique({
      where: {
        id: laundryItemId,
        deletedAt: null,
      },
    });

    if (!existingLaundryItem) {
      throw new ApiError("Item laundry tidak ditemukan", 404);
    }

    if (name && name !== existingLaundryItem.name) {
      const duplicateLaundryItem = await this.prisma.laundryItem.findFirst({
        where: {
          name: {
            equals: name,
            mode: "insensitive",
          },
          id: {
            not: laundryItemId,
          },
          deletedAt: null,
        },
      });

      if (duplicateLaundryItem) {
        throw new ApiError("Item laundry dengan nama tersebut sudah ada", 400);
      }
    }

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (pricingType !== undefined) updateData.pricingType = pricingType;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (pricingType !== undefined) {
      if (pricingType === "PER_KG") {
        updateData.basePrice = 0;
      } else if (pricingType === "PER_PIECE" && basePrice !== undefined) {
        updateData.basePrice = basePrice;
      }
    } else if (
      basePrice !== undefined &&
      existingLaundryItem.pricingType === "PER_PIECE"
    ) {
      updateData.basePrice = basePrice;
    }

    const result = await this.prisma.laundryItem.update({
      where: { id: laundryItemId },
      data: updateData,
      select: {
        id: true,
        name: true,
        category: true,
        basePrice: true,
        pricingType: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: "Item laundry berhasil diupdate",
      data: result,
    };
  };

  deleteLaundryItem = async (laundryItemId: number) => {
    const result = await this.prisma.$transaction(async (tx) => {
      const existingItem = await tx.laundryItem.findFirst({
        where: {
          id: laundryItemId,
          deletedAt: null,
        },
        include: {
          _count: {
            select: {
              orderItems: {
                where: {
                  order: {
                    orderStatus: {
                      in: [
                        "WAITING_FOR_PICKUP",
                        "DRIVER_ON_THE_WAY_TO_CUSTOMER",
                        "ARRIVED_AT_CUSTOMER",
                        "DRIVER_ON_THE_WAY_TO_OUTLET",
                        "ARRIVED_AT_OUTLET",
                        "BEING_WASHED",
                        "BEING_IRONED",
                        "BEING_PACKED",
                        "WAITING_PAYMENT",
                        "READY_FOR_DELIVERY",
                        "BEING_DELIVERED_TO_CUSTOMER",
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!existingItem) {
        throw new ApiError("Item laundry tidak ditemukan", 404);
      }

      if (existingItem._count.orderItems > 0) {
        throw new ApiError(
          "Item laundry tidak dapat dihapus karena sedang digunakan dalam pesanan aktif",
          400,
        );
      }

      const deletedLaundryItem = await tx.laundryItem.update({
        where: { id: laundryItemId },
        data: { deletedAt: new Date() },
      });

      return deletedLaundryItem;
    });

    return {
      success: true,
      message: "Item laundry berhasil dihapus",
      data: {
        id: result.id,
        name: result.name,
        category: result.category,
        basePrice: result.basePrice,
        pricingType: result.pricingType,
        deletedAt: result.deletedAt,
      },
    };
  };
}
