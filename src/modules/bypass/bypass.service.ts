import { BypassStatus, Prisma } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { GetBypassRequestsDTO } from "./dto/get-bypass-requests.dto";
import { ProcessBypassRequestDTO } from "./dto/process-bypass-request.dto";

@injectable()
export class BypassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  getBypassRequests = async (dto: GetBypassRequestsDTO, outletId: number) => {
    const { page, take, sortBy, sortOrder, all, status, workerType } = dto;

    const whereClause: Prisma.BypassRequestWhereInput = {
      orderWorkProcesses: {
        some: {
          employee: {
            outletId: outletId,
          },
        },
      },
    };

    if (status) {
      whereClause.bypassStatus = status;
    }

    if (workerType) {
      whereClause.orderWorkProcesses = {
        some: {
          workerType: workerType,
          employee: {
            outletId: outletId,
          },
        },
      };
    }

    let paginationArgs: Prisma.BypassRequestFindManyArgs = {};

    if (!all) {
      paginationArgs = {
        skip: (page - 1) * take,
        take,
      };
    }

    const bypassRequests = await this.prisma.bypassRequest.findMany({
      where: whereClause,
      orderBy: { [sortBy]: sortOrder },
      include: {
        approvedByEmployee: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            outlet: {
              select: {
                outletName: true,
              },
            },
          },
        },
        orderWorkProcesses: {
          include: {
            order: {
              select: {
                uuid: true,
                orderNumber: true,
                orderStatus: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            employee: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
      ...paginationArgs,
    });

    const count = await this.prisma.bypassRequest.count({ where: whereClause });

    return {
      data: bypassRequests,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };

  getBypassRequestDetail = async (id: number, outletId: number) => {
    const whereClause: Prisma.BypassRequestWhereInput = {
      id,
      orderWorkProcesses: {
        some: {
          employee: {
            outletId: outletId,
          },
        },
      },
    };

    const bypassRequest = await this.prisma.bypassRequest.findFirst({
      where: whereClause,
      include: {
        approvedByEmployee: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            outlet: {
              select: {
                outletName: true,
                address: true,
              },
            },
          },
        },
        orderWorkProcesses: {
          include: {
            order: {
              include: {
                orderItems: {
                  include: {
                    laundryItem: true,
                    orderItemDetails: true,
                  },
                },
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            employee: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!bypassRequest) {
      throw new ApiError("Bypass request not found or access denied", 404);
    }

    return bypassRequest;
  };

  approveBypassRequest = async (
    id: number,
    dto: ProcessBypassRequestDTO,
    adminEmployeeId: number,
    outletId: number,
  ) => {
    return await this.prisma.$transaction(async (tx) => {
      await this.validateBypassRequestOwnership(id, outletId, tx);

      const updatedBypassRequest = await tx.bypassRequest.update({
        where: { id },
        data: {
          bypassStatus: BypassStatus.APPROVED,
          adminNote: dto.adminNote,
          approvedBy: adminEmployeeId,
          updatedAt: new Date(),
        },
        include: {
          orderWorkProcesses: {
            include: {
              order: true,
            },
          },
        },
      });

      return updatedBypassRequest;
    });
  };

  rejectBypassRequest = async (
    id: number,
    dto: ProcessBypassRequestDTO,
    adminEmployeeId: number,
    outletId: number,
  ) => {
    return await this.prisma.$transaction(async (tx) => {
      await this.validateBypassRequestOwnership(id, outletId, tx);

      const updatedBypassRequest = await tx.bypassRequest.update({
        where: { id },
        data: {
          bypassStatus: BypassStatus.REJECTED,
          adminNote: dto.adminNote,
          approvedBy: adminEmployeeId,
          updatedAt: new Date(),
        },
        include: {
          orderWorkProcesses: {
            include: {
              order: true,
            },
          },
        },
      });

      return updatedBypassRequest;
    });
  };

  private validateBypassRequestOwnership = async (
    id: number,
    outletId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> => {
    const client = tx || this.prisma;

    const whereClause: Prisma.BypassRequestWhereInput = {
      id,
      bypassStatus: BypassStatus.PENDING,
      orderWorkProcesses: {
        some: {
          employee: {
            outletId: outletId,
          },
        },
      },
    };

    const bypassRequest = await client.bypassRequest.findFirst({
      where: whereClause,
    });

    if (!bypassRequest) {
      throw new ApiError(
        "Bypass request not found, already processed, or access denied",
        404,
      );
    }
  };

  getBypassRequestStats = async (outletId: number) => {
    const whereClause: Prisma.BypassRequestWhereInput = {
      orderWorkProcesses: {
        some: {
          employee: {
            outletId: outletId,
          },
        },
      },
    };

    const [pending, approved, rejected, total] = await Promise.all([
      this.prisma.bypassRequest.count({
        where: { ...whereClause, bypassStatus: BypassStatus.PENDING },
      }),
      this.prisma.bypassRequest.count({
        where: { ...whereClause, bypassStatus: BypassStatus.APPROVED },
      }),
      this.prisma.bypassRequest.count({
        where: { ...whereClause, bypassStatus: BypassStatus.REJECTED },
      }),
      this.prisma.bypassRequest.count({ where: whereClause }),
    ]);

    return {
      pending,
      approved,
      rejected,
      total,
    };
  };
}