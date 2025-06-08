import { OrderStatus, Prisma, Role, WorkerTypes } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { GetOrdersDTO } from "./dto/get-orders.dto";

export interface CurrentUser {
  id: number;
  role: Role;
  outletId?: number;
}

@injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  getOrders = async (query: GetOrdersDTO, currentUser: CurrentUser) => {
    const {
      page = 1,
      take = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
      status,
      outletId,
      employeeId,
      startDate,
      endDate,
    } = query;

    await this.validateQueryInputs(query, currentUser);

    const where: Prisma.OrderWhereInput = {
      user: { deletedAt: null },
    };

    const andConditions: Prisma.OrderWhereInput[] = [];

    if (currentUser.role === Role.ADMIN) {
      if (outletId) {
        await this.validateOutlet(parseInt(outletId));
        where.outletId = parseInt(outletId);
      }
    } else if (currentUser.role === Role.OUTLET_ADMIN) {
      const userOutlet = await this.getUserOutlet(currentUser.id);
      where.outletId = userOutlet.outletId;

      if (outletId && parseInt(outletId) !== userOutlet.outletId) {
        throw new ApiError(
          "Outlet admin hanya bisa melihat order dari outlet sendiri",
          403,
        );
      }
    } else {
      throw new ApiError("Permission tidak cukup", 403);
    }

    if (status) {
      where.orderStatus = status;
    }

    if (search) {
      andConditions.push({
        OR: [
          {
            orderNumber: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            user: {
              OR: [
                {
                  firstName: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
                {
                  lastName: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
              ],
            },
          },
        ],
      });
    }

    if (employeeId) {
      await this.validateEmployee(parseInt(employeeId));
      andConditions.push({
        OR: [
          {
            orderWorkProcess: {
              some: {
                employeeId: parseInt(employeeId),
              },
            },
          },
          {
            pickUpJobs: {
              some: {
                employeeId: parseInt(employeeId),
              },
            },
          },
          {
            deliveryJobs: {
              some: {
                employeeId: parseInt(employeeId),
              },
            },
          },
        ],
      });
    }

    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        dateFilter.gte = new Date(startDate + "T00:00:00.000Z");
      }
      if (endDate) {
        dateFilter.lte = new Date(endDate + "T23:59:59.999Z");
      }
      where.createdAt = dateFilter;
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const select = {
      uuid: true,
      orderNumber: true,
      orderStatus: true,
      totalWeight: true,
      totalPrice: true,
      paymentStatus: true,
      scheduledPickupTime: true,
      actualPickupTime: true,
      scheduledDeliveryTime: true,
      actualDeliveryTime: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      outlet: {
        select: {
          id: true,
          outletName: true,
          isActive: true,
        },
      },

      orderWorkProcess: {
        select: {
          id: true,
          workerType: true,
          completedAt: true,
          createdAt: true,
          notes: true,
          employee: {
            select: {
              id: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          bypass: {
            select: {
              id: true,
              reason: true,
              bypassStatus: true,
              createdAt: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc" as const,
        },
      },

      pickUpJobs: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          employee: {
            select: {
              id: true,
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

      deliveryJobs: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          employee: {
            select: {
              id: true,
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
    };

    const [orders, count] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.order.count({ where }),
    ]);

    const transformedOrders = orders.map((order) => {
      const currentWorkProcess = order.orderWorkProcess?.find(
        (wp) => !wp.completedAt,
      );

      const completedProcesses =
        order.orderWorkProcess?.filter((wp) => wp.completedAt) || [];

      return {
        uuid: order.uuid,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        totalWeight: order.totalWeight,
        totalPrice: order.totalPrice,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        customer: {
          id: order.user.id,
          name: `${order.user.firstName} ${order.user.lastName}`,
          email: order.user.email,
        },
        outlet: order.outlet,

        tracking: {
          currentWorker: currentWorkProcess
            ? {
                id: currentWorkProcess.employee.id,
                name: currentWorkProcess.employee?.user
                  ? `${currentWorkProcess.employee.user.firstName} ${currentWorkProcess.employee.user.lastName}`
                  : "Worker tidak tersedia",
                workerType: currentWorkProcess.workerType,
                station: this.getStationName(currentWorkProcess.workerType),
                startedAt: currentWorkProcess.createdAt,
                notes: currentWorkProcess.notes,
                hasBypass: !!currentWorkProcess.bypass,
              }
            : null,
          processHistory: completedProcesses.map((wp) => {
            const workerName = wp.employee?.user
              ? `${wp.employee.user.firstName} ${wp.employee.user.lastName}`
              : "Worker tidak tersedia";

            return {
              station: this.getStationName(wp.workerType),
              worker: workerName,
              startedAt: wp.createdAt,
              completedAt: wp.completedAt,
              duration: this.calculateDuration(wp.createdAt, wp.completedAt!),
              notes: wp.notes,
              hasBypass: !!wp.bypass,
            };
          }),
          pickup: order.pickUpJobs?.[0]
            ? {
                id: order.pickUpJobs[0].id,
                driver: order.pickUpJobs[0].employee?.user
                  ? `${order.pickUpJobs[0].employee.user.firstName} ${order.pickUpJobs[0].employee.user.lastName}`
                  : "Driver tidak tersedia",
                status: order.pickUpJobs[0].status,
                assignedAt: order.pickUpJobs[0].createdAt,
                lastUpdate: order.pickUpJobs[0].updatedAt,
              }
            : null,
          delivery: order.deliveryJobs?.[0]
            ? {
                id: order.deliveryJobs[0].id,
                driver: order.deliveryJobs[0].employee?.user
                  ? `${order.deliveryJobs[0].employee.user.firstName} ${order.deliveryJobs[0].employee.user.lastName}`
                  : "Driver tidak tersedia",
                status: order.deliveryJobs[0].status,
                assignedAt: order.deliveryJobs[0].createdAt,
                lastUpdate: order.deliveryJobs[0].updatedAt,
              }
            : null,
          timeline: this.generateOrderTimeline(order),
        },
      };
    });

    return {
      data: transformedOrders,
      meta: this.paginationService.generateMeta({
        page,
        take,
        count,
      }),
    };
  };

  private async validateQueryInputs(
    query: GetOrdersDTO,
    currentUser: CurrentUser,
  ): Promise<void> {
    const { status, startDate, endDate, employeeId, outletId } = query;

    if (status && !Object.values(OrderStatus).includes(status)) {
      throw new ApiError("Status order tidak valid", 400);
    }

    if (startDate && isNaN(Date.parse(startDate))) {
      throw new ApiError("Format tanggal mulai tidak valid", 400);
    }

    if (endDate && isNaN(Date.parse(endDate))) {
      throw new ApiError("Format tanggal akhir tidak valid", 400);
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      throw new ApiError(
        "Tanggal mulai tidak boleh lebih besar dari tanggal akhir",
        400,
      );
    }

    if (
      employeeId &&
      (isNaN(parseInt(employeeId)) || parseInt(employeeId) <= 0)
    ) {
      throw new ApiError("Employee ID tidak valid", 400);
    }

    if (outletId && (isNaN(parseInt(outletId)) || parseInt(outletId) <= 0)) {
      throw new ApiError("Outlet ID tidak valid", 400);
    }

    if (currentUser.role === Role.OUTLET_ADMIN && outletId) {
      const userOutlet = await this.getUserOutlet(currentUser.id);
      if (parseInt(outletId) !== userOutlet.outletId) {
        throw new ApiError(
          "Outlet admin hanya bisa filter outlet sendiri",
          403,
        );
      }
    }
  }

  private getStationName(workerType: WorkerTypes): string {
    const stationMap = {
      WASHING: "Washing Station",
      IRONING: "Ironing Station",
      PACKING: "Packing Station",
    };
    return stationMap[workerType];
  }

  private calculateDuration(startDate: Date, endDate: Date): string {
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 0) {
      return `${diffHours}h ${diffMins}m`;
    }
    return `${diffMins}m`;
  }

  private generateOrderTimeline(order: any): any[] {
    const timeline: any[] = [];

    timeline.push({
      event: "Order Created",
      timestamp: order.createdAt,
      status: "COMPLETED",
      description: "Customer request pickup created",
    });

    if (order.pickUpJobs?.[0]) {
      const pickup = order.pickUpJobs[0];
      const driverName = pickup.employee?.user
        ? `${pickup.employee.user.firstName} ${pickup.employee.user.lastName}`
        : "Driver tidak tersedia";

      timeline.push({
        event: "Pickup Assigned",
        timestamp: pickup.createdAt,
        status: "COMPLETED",
        description: `Assigned to driver: ${driverName}`,
      });
    }

    order.orderWorkProcess?.forEach((wp: any) => {
      const workerName = wp.employee?.user
        ? `${wp.employee.user.firstName} ${wp.employee.user.lastName}`
        : "Worker tidak tersedia";

      timeline.push({
        event: `${this.getStationName(wp.workerType)} Started`,
        timestamp: wp.createdAt,
        status: wp.completedAt ? "COMPLETED" : "IN_PROGRESS",
        description: `Handled by: ${workerName}`,
        worker: workerName,
        notes: wp.notes,
        hasBypass: !!wp.bypass,
      });

      if (wp.completedAt) {
        timeline.push({
          event: `${this.getStationName(wp.workerType)} Completed`,
          timestamp: wp.completedAt,
          status: "COMPLETED",
          description: `Completed in ${this.calculateDuration(wp.createdAt, wp.completedAt)}`,
        });
      }
    });

    if (order.deliveryJobs?.[0]) {
      const delivery = order.deliveryJobs[0];
      const driverName = delivery.employee?.user
        ? `${delivery.employee.user.firstName} ${delivery.employee.user.lastName}`
        : "Driver tidak tersedia";

      timeline.push({
        event: "Delivery Assigned",
        timestamp: delivery.createdAt,
        status: delivery.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
        description: `Assigned to driver: ${driverName}`,
      });
    }

    return timeline.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  private async validateOutlet(outletId: number): Promise<void> {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: outletId },
      select: { id: true, isActive: true },
    });

    if (!outlet) {
      throw new ApiError("Outlet tidak ditemukan", 404);
    }
  }

  private async validateEmployee(employeeId: number): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });

    if (!employee) {
      throw new ApiError("Employee tidak ditemukan", 404);
    }
  }

  private async getUserOutlet(userId: number): Promise<{ outletId: number }> {
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
      select: { outletId: true },
    });

    if (!employee) {
      throw new ApiError("Data employee tidak ditemukan", 400);
    }

    return employee;
  }
}
