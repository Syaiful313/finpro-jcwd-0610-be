import { BypassStatus, OrderStatus, Prisma } from "@prisma/client";
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
      approvedByEmployee: {
        outletId: outletId,
      },
    };

    if (status) {
      whereClause.bypassStatus = status;
    }

    if (workerType) {
      whereClause.orderWorkProcesses = {
        some: {
          workerType: workerType,
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

      approvedByEmployee: {
        outletId: outletId,
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
      const bypassRequest = await this.validateBypassRequestOwnership(
        id,
        outletId,
        tx,
      );

      const updatedBypassRequest = await tx.bypassRequest.update({
        where: { id },
        data: {
          bypassStatus: BypassStatus.APPROVED,
          adminNote: dto.adminNote,
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

      for (const workProcess of updatedBypassRequest.orderWorkProcesses) {
        await this.moveOrderToNextStation(workProcess.orderId, tx);
      }

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
      const bypassRequest = await this.validateBypassRequestOwnership(
        id,
        outletId,
        tx,
      );

      const updatedBypassRequest = await tx.bypassRequest.update({
        where: { id },
        data: {
          bypassStatus: BypassStatus.REJECTED,
          adminNote: dto.adminNote,
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

      for (const workProcess of updatedBypassRequest.orderWorkProcesses) {
        await tx.orderWorkProcess.delete({
          where: { id: workProcess.id },
        });
      }

      return updatedBypassRequest;
    });
  };

  private validateBypassRequestOwnership = async (
    id: number,
    outletId: number,
    tx?: Prisma.TransactionClient,
  ) => {
    const client = tx || this.prisma;

    const whereClause: Prisma.BypassRequestWhereInput = {
      id,
      bypassStatus: BypassStatus.PENDING,

      approvedByEmployee: {
        outletId: outletId,
      },
    };

    const bypassRequest = await client.bypassRequest.findFirst({
      where: whereClause,
      include: {
        orderWorkProcesses: {
          include: {
            order: true,
          },
        },
      },
    });

    if (!bypassRequest) {
      throw new ApiError(
        "Bypass request not found, already processed, or access denied",
        404,
      );
    }

    return bypassRequest;
  };

  private moveOrderToNextStation = async (
    orderId: string,
    tx: Prisma.TransactionClient,
  ) => {
    const order = await tx.order.findUnique({
      where: { uuid: orderId },
      include: {
        orderWorkProcess: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!order) {
      throw new ApiError("Order not found", 404);
    }

    const currentStatus = order.orderStatus;
    let nextStatus: OrderStatus;

    switch (currentStatus) {
      case OrderStatus.BEING_WASHED:
        nextStatus = OrderStatus.BEING_IRONED;
        break;
      case OrderStatus.BEING_IRONED:
        nextStatus = OrderStatus.BEING_PACKED;
        break;
      case OrderStatus.BEING_PACKED:
        if (order.paymentStatus === "PAID") {
          nextStatus = OrderStatus.READY_FOR_DELIVERY;
        } else {
          nextStatus = OrderStatus.WAITING_PAYMENT;
        }
        break;
      default:
        throw new ApiError(
          `Cannot move order from status: ${currentStatus}`,
          400,
        );
    }

    await tx.order.update({
      where: { uuid: orderId },
      data: {
        orderStatus: nextStatus,
        updatedAt: new Date(),
      },
    });
  };

  getBypassRequestStats = async (outletId: number) => {
    const whereClause: Prisma.BypassRequestWhereInput = {
      approvedByEmployee: {
        outletId: outletId,
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
