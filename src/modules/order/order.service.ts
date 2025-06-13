import { OrderStatus, Prisma, Role, WorkerTypes } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { DistanceCalculator } from "../../utils/distance.calculator";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { GetOrdersDTO } from "./dto/get-orders.dto";
import { GetPendingOrdersDTO } from "./dto/get-pending-orders.dto";
import { ProcessOrderDTO } from "./dto/proses-order.dto";

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

  getOrderDetail = async (orderId: string, currentUser: CurrentUser) => {
    if (
      !([Role.ADMIN, Role.OUTLET_ADMIN] as Role[]).includes(currentUser.role)
    ) {
      throw new ApiError(
        "Permission tidak cukup untuk melihat detail order",
        403,
      );
    }

    const whereClause: Prisma.OrderWhereInput = {
      uuid: orderId,
      user: { deletedAt: null },
    };

    if (currentUser.role === Role.OUTLET_ADMIN) {
      const userOutlet = await this.getUserOutlet(currentUser.id);
      whereClause.outletId = userOutlet.outletId;
    }

    const order = await this.prisma.order.findFirst({
      where: whereClause,
      select: {
        uuid: true,
        orderNumber: true,
        orderStatus: true,
        addressLine: true,
        district: true,
        city: true,
        province: true,
        postalCode: true,
        scheduledPickupTime: true,
        actualPickupTime: true,
        scheduledDeliveryTime: true,
        actualDeliveryTime: true,
        totalWeight: true,
        totalPrice: true,
        totalDeliveryFee: true,
        paymentStatus: true,
        createdAt: true,
        updatedAt: true,

        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            addresses: {
              select: {
                id: true,
                addressName: true,
                addressLine: true,
                district: true,
                city: true,
                province: true,
                postalCode: true,
                latitude: true,
                longitude: true,
                isPrimary: true,
              },
              orderBy: { isPrimary: "desc" },
            },
          },
        },

        outlet: {
          select: {
            id: true,
            outletName: true,
            address: true,
            latitude: true,
            longitude: true,
            serviceRadius: true,
            deliveryBaseFee: true,
            deliveryPerKm: true,
            isActive: true,
          },
        },

        orderItems: {
          select: {
            id: true,
            quantity: true,
            weight: true,
            pricePerUnit: true,
            color: true,
            brand: true,
            materials: true,
            totalPrice: true,
            createdAt: true,
            laundryItem: {
              select: {
                id: true,
                name: true,
                category: true,
                basePrice: true,
                pricingType: true,
              },
            },
            orderItemDetails: {
              select: {
                id: true,
                name: true,
                qty: true,
              },
              orderBy: { name: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },

        pickUpJobs: {
          select: {
            id: true,
            status: true,
            pickUpPhotos: true,
            pickUpScheduleOutlet: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
            employee: {
              select: {
                id: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },

        deliveryJobs: {
          select: {
            id: true,
            status: true,
            deliveryPhotos: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
            employee: {
              select: {
                id: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },

        orderWorkProcess: {
          select: {
            id: true,
            workerType: true,
            notes: true,
            completedAt: true,
            createdAt: true,
            employee: {
              select: {
                id: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                  },
                },
              },
            },
            bypass: {
              select: {
                id: true,
                reason: true,
                adminNote: true,
                bypassStatus: true,
                createdAt: true,
                updatedAt: true,
                approvedByEmployee: {
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
          },
          orderBy: { createdAt: "asc" },
        },

        notifications: {
          select: {
            id: true,
            message: true,
            orderStatus: true,
            notifType: true,
            role: true,
            isRead: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!order) {
      throw new ApiError("Order tidak ditemukan", 404);
    }

    let deliveryInfo = null;
    const primaryAddress =
      order.user.addresses.find((addr) => addr.isPrimary) ||
      order.user.addresses[0];

    if (primaryAddress && order.outlet) {
      try {
        const distance = DistanceCalculator.calculateDistance(
          order.outlet.latitude,
          order.outlet.longitude,
          primaryAddress.latitude,
          primaryAddress.longitude,
        );

        const calculatedDeliveryFee = DistanceCalculator.calculateDeliveryFee(
          distance,
          {
            deliveryBaseFee: order.outlet.deliveryBaseFee,
            deliveryPerKm: order.outlet.deliveryPerKm,
            serviceRadius: order.outlet.serviceRadius,
          },
        );

        deliveryInfo = {
          distance: parseFloat(distance.toFixed(2)),
          calculatedFee: calculatedDeliveryFee,
          actualFee: order.totalDeliveryFee,
          baseFee: order.outlet.deliveryBaseFee,
          perKmFee: order.outlet.deliveryPerKm,
          withinServiceRadius: distance <= order.outlet.serviceRadius,
        };
      } catch (error) {
        console.warn("Failed to calculate delivery info:", error);
      }
    }

    const workProcesses = {
      current: order.orderWorkProcess.find((wp) => !wp.completedAt),
      completed: order.orderWorkProcess.filter((wp) => wp.completedAt),
      all: order.orderWorkProcess,
    };

    const detailedTimeline = this.generateDetailedTimeline(order);

    const pricing = {
      items: order.orderItems.reduce((sum, item) => sum + item.totalPrice, 0),
      delivery: order.totalDeliveryFee || 0,
      total: order.totalPrice || 0,
      breakdown: order.orderItems.map((item) => ({
        name: item.laundryItem.name,
        category: item.laundryItem.category,
        pricingType: item.laundryItem.pricingType,
        quantity: item.quantity,
        weight: item.weight,
        pricePerUnit: item.pricePerUnit,
        totalPrice: item.totalPrice,
      })),
    };

    return {
      uuid: order.uuid,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,

      customer: {
        id: order.user.id,
        name: `${order.user.firstName} ${order.user.lastName}`,
        email: order.user.email,
        phoneNumber: order.user.phoneNumber,
        addresses: order.user.addresses,
        primaryAddress: primaryAddress,
      },

      outlet: order.outlet,

      deliveryAddress: {
        fullAddress: order.addressLine,
        district: order.district,
        city: order.city,
        province: order.province,
        postalCode: order.postalCode,
      },

      schedule: {
        scheduledPickupTime: order.scheduledPickupTime,
        actualPickupTime: order.actualPickupTime,
        scheduledDeliveryTime: order.scheduledDeliveryTime,
        actualDeliveryTime: order.actualDeliveryTime,
      },

      items: order.orderItems.map((item) => ({
        id: item.id,
        laundryItem: item.laundryItem,
        quantity: item.quantity,
        weight: item.weight,
        pricePerUnit: item.pricePerUnit,
        color: item.color,
        brand: item.brand,
        materials: item.materials,
        totalPrice: item.totalPrice,
        details: item.orderItemDetails,
        createdAt: item.createdAt,
      })),

      pricing,

      delivery: {
        info: deliveryInfo,
        totalWeight: order.totalWeight,
        jobs: order.deliveryJobs.map((job) => ({
          id: job.id,
          status: job.status,
          driver: job.employee?.user
            ? `${job.employee.user.firstName} ${job.employee.user.lastName}`
            : "Driver tidak tersedia",
          driverPhone: job.employee?.user?.phoneNumber,
          photos: job.deliveryPhotos,
          notes: job.notes,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })),
      },

      pickup: {
        jobs: order.pickUpJobs.map((job) => ({
          id: job.id,
          status: job.status,
          driver: job.employee?.user
            ? `${job.employee.user.firstName} ${job.employee.user.lastName}`
            : "Driver tidak tersedia",
          driverPhone: job.employee?.user?.phoneNumber,
          photos: job.pickUpPhotos,
          scheduledOutlet: job.pickUpScheduleOutlet,
          notes: job.notes,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })),
      },

      workProcess: {
        current: workProcesses.current
          ? {
              id: workProcesses.current.id,
              type: workProcesses.current.workerType,
              station: this.getStationName(workProcesses.current.workerType),
              worker: workProcesses.current.employee?.user
                ? `${workProcesses.current.employee.user.firstName} ${workProcesses.current.employee.user.lastName}`
                : "Worker tidak tersedia",
              workerPhone: workProcesses.current.employee?.user?.phoneNumber,
              startedAt: workProcesses.current.createdAt,
              notes: workProcesses.current.notes,
              bypass: workProcesses.current.bypass,
            }
          : null,

        completed: workProcesses.completed.map((wp) => ({
          id: wp.id,
          type: wp.workerType,
          station: this.getStationName(wp.workerType),
          worker: wp.employee?.user
            ? `${wp.employee.user.firstName} ${wp.employee.user.lastName}`
            : "Worker tidak tersedia",
          workerPhone: wp.employee?.user?.phoneNumber,
          startedAt: wp.createdAt,
          completedAt: wp.completedAt,
          duration: wp.completedAt
            ? this.calculateDuration(wp.createdAt, wp.completedAt)
            : null,
          notes: wp.notes,
          bypass: wp.bypass,
        })),

        progress: this.calculateWorkProgress(
          order.orderStatus,
          workProcesses.all,
        ),
      },

      notifications: order.notifications,

      timeline: detailedTimeline,
    };
  };

  private generateDetailedTimeline(order: any): any[] {
    const timeline: any[] = [];

    timeline.push({
      id: `order-created-${order.uuid}`,
      event: "Order Created",
      type: "ORDER",
      status: "COMPLETED",
      timestamp: order.createdAt,
      description: "Customer created pickup request",
      metadata: {
        orderNumber: order.orderNumber,
        totalItems: order.orderItems.length,
      },
    });

    order.pickUpJobs?.forEach((pickup: any, index: number) => {
      timeline.push({
        id: `pickup-assigned-${pickup.id}`,
        event: "Pickup Assigned",
        type: "PICKUP",
        status: "COMPLETED",
        timestamp: pickup.createdAt,
        description: `Pickup assigned to driver`,
        metadata: {
          driver: pickup.employee?.user
            ? `${pickup.employee.user.firstName} ${pickup.employee.user.lastName}`
            : "Driver tidak tersedia",
          driverPhone: pickup.employee?.user?.phoneNumber,
          notes: pickup.notes,
        },
      });

      if (pickup.status === "COMPLETED") {
        timeline.push({
          id: `pickup-completed-${pickup.id}`,
          event: "Pickup Completed",
          type: "PICKUP",
          status: "COMPLETED",
          timestamp: pickup.updatedAt,
          description: "Items picked up from customer",
          metadata: {
            driver: pickup.employee?.user
              ? `${pickup.employee.user.firstName} ${pickup.employee.user.lastName}`
              : "Driver tidak tersedia",
            scheduledOutlet: pickup.pickUpScheduleOutlet,
            photos: pickup.pickUpPhotos,
          },
        });
      }
    });

    order.orderWorkProcess?.forEach((wp: any) => {
      const workerName = wp.employee?.user
        ? `${wp.employee.user.firstName} ${wp.employee.user.lastName}`
        : "Worker tidak tersedia";

      timeline.push({
        id: `work-started-${wp.id}`,
        event: `${this.getStationName(wp.workerType)} Started`,
        type: "WORK_PROCESS",
        status: wp.completedAt ? "COMPLETED" : "IN_PROGRESS",
        timestamp: wp.createdAt,
        description: `Work started at ${this.getStationName(wp.workerType)}`,
        metadata: {
          worker: workerName,
          workerPhone: wp.employee?.user?.phoneNumber,
          workerType: wp.workerType,
          notes: wp.notes,
          hasBypass: !!wp.bypass,
          bypass: wp.bypass,
        },
      });

      if (wp.completedAt) {
        timeline.push({
          id: `work-completed-${wp.id}`,
          event: `${this.getStationName(wp.workerType)} Completed`,
          type: "WORK_PROCESS",
          status: "COMPLETED",
          timestamp: wp.completedAt,
          description: `Work completed at ${this.getStationName(wp.workerType)}`,
          metadata: {
            worker: workerName,
            duration: this.calculateDuration(wp.createdAt, wp.completedAt),
            notes: wp.notes,
          },
        });
      }
    });

    order.deliveryJobs?.forEach((delivery: any) => {
      timeline.push({
        id: `delivery-assigned-${delivery.id}`,
        event: "Delivery Assigned",
        type: "DELIVERY",
        status: delivery.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
        timestamp: delivery.createdAt,
        description: "Delivery assigned to driver",
        metadata: {
          driver: delivery.employee?.user
            ? `${delivery.employee.user.firstName} ${delivery.employee.user.lastName}`
            : "Driver tidak tersedia",
          driverPhone: delivery.employee?.user?.phoneNumber,
          notes: delivery.notes,
        },
      });

      if (delivery.status === "COMPLETED") {
        timeline.push({
          id: `delivery-completed-${delivery.id}`,
          event: "Delivery Completed",
          type: "DELIVERY",
          status: "COMPLETED",
          timestamp: delivery.updatedAt,
          description: "Items delivered to customer",
          metadata: {
            driver: delivery.employee?.user
              ? `${delivery.employee.user.firstName} ${delivery.employee.user.lastName}`
              : "Driver tidak tersedia",
            photos: delivery.deliveryPhotos,
          },
        });
      }
    });

    order.notifications?.forEach((notif: any) => {
      timeline.push({
        id: `notification-${notif.id}`,
        event: "Notification Sent",
        type: "NOTIFICATION",
        status: "COMPLETED",
        timestamp: notif.createdAt,
        description: notif.message,
        metadata: {
          notifType: notif.notifType,
          role: notif.role,
          isRead: notif.isRead,
        },
      });
    });

    return timeline.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  private calculateWorkProgress(
    orderStatus: OrderStatus,
    workProcesses: any[],
  ): any {
    const stages = [
      { stage: "WASHING", status: WorkerTypes.WASHING, label: "Washing" },
      { stage: "IRONING", status: WorkerTypes.IRONING, label: "Ironing" },
      { stage: "PACKING", status: WorkerTypes.PACKING, label: "Packing" },
    ];

    const progress = stages.map((stage) => {
      const process = workProcesses.find(
        (wp) => wp.workerType === stage.status,
      );

      if (!process) {
        return {
          stage: stage.stage,
          label: stage.label,
          status: "PENDING",
          startedAt: null,
          completedAt: null,
          worker: null,
        };
      }

      return {
        stage: stage.stage,
        label: stage.label,
        status: process.completedAt ? "COMPLETED" : "IN_PROGRESS",
        startedAt: process.createdAt,
        completedAt: process.completedAt,
        worker: process.employee?.user
          ? `${process.employee.user.firstName} ${process.employee.user.lastName}`
          : "Worker tidak tersedia",
      };
    });

    const completedStages = progress.filter(
      (p) => p.status === "COMPLETED",
    ).length;
    const inProgressStages = progress.filter(
      (p) => p.status === "IN_PROGRESS",
    ).length;
    const totalStages = stages.length;

    return {
      stages: progress,
      summary: {
        completed: completedStages,
        inProgress: inProgressStages,
        pending: totalStages - completedStages - inProgressStages,
        total: totalStages,
        percentage: Math.round((completedStages / totalStages) * 100),
      },
    };
  }

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

  getPendingProcessOrders = async (
    query: GetPendingOrdersDTO,
    currentUser: CurrentUser,
  ) => {
    if (currentUser.role !== Role.OUTLET_ADMIN) {
      throw new ApiError(
        "Hanya outlet admin yang dapat memproses pesanan",
        403,
      );
    }

    const {
      page = 1,
      take = 10,
      sortBy = "createdAt",
      sortOrder = "asc",
      search,
      customerName,
    } = query;

    const userOutlet = await this.getUserOutlet(currentUser.id);

    const where: Prisma.OrderWhereInput = {
      outletId: userOutlet.outletId,
      orderStatus: OrderStatus.ARRIVED_AT_OUTLET,
      user: { deletedAt: null },
    };

    const andConditions: Prisma.OrderWhereInput[] = [];

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

    if (customerName) {
      andConditions.push({
        user: {
          OR: [
            {
              firstName: {
                contains: customerName,
                mode: "insensitive",
              },
            },
            {
              lastName: {
                contains: customerName,
                mode: "insensitive",
              },
            },
          ],
        },
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [orders, count] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          uuid: true,
          orderNumber: true,
          orderStatus: true,
          scheduledPickupTime: true,
          actualPickupTime: true,
          addressLine: true,
          district: true,
          city: true,
          province: true,
          postalCode: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
              addresses: {
                where: { isPrimary: true },
                select: {
                  latitude: true,
                  longitude: true,
                },
                take: 1,
              },
            },
          },
          outlet: {
            select: {
              id: true,
              outletName: true,
              latitude: true,
              longitude: true,
              deliveryBaseFee: true,
              deliveryPerKm: true,
              serviceRadius: true,
            },
          },
          pickUpJobs: {
            select: {
              id: true,
              status: true,
              pickUpScheduleOutlet: true,
              notes: true,
              createdAt: true,
              employee: {
                select: {
                  id: true,
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                      phoneNumber: true,
                    },
                  },
                },
              },
            },
            where: {
              status: "COMPLETED",
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.order.count({ where }),
    ]);

    const transformedOrders = orders.map((order) => {
      const customerCoordinates =
        order.user.addresses.length > 0
          ? {
              latitude: order.user.addresses[0].latitude,
              longitude: order.user.addresses[0].longitude,
            }
          : null;

      return {
        uuid: order.uuid,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        scheduledPickupTime: order.scheduledPickupTime,
        actualPickupTime: order.actualPickupTime,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        customer: {
          id: order.user.id,
          name: `${order.user.firstName} ${order.user.lastName}`,
          email: order.user.email,
          phoneNumber: order.user.phoneNumber,
        },
        address: {
          fullAddress: order.addressLine,
          district: order.district,
          city: order.city,
          province: order.province,
          postalCode: order.postalCode,
        },
        customerCoordinates,
        outlet: order.outlet,
        pickupInfo: order.pickUpJobs[0]
          ? {
              driver: `${order.pickUpJobs[0].employee?.user.firstName} ${order.pickUpJobs[0].employee?.user.lastName}`,
              driverPhone: order.pickUpJobs[0].employee?.user.phoneNumber,
              scheduledOutlet: order.pickUpJobs[0].pickUpScheduleOutlet,
              notes: order.pickUpJobs[0].notes,
              completedAt: order.pickUpJobs[0].createdAt,
            }
          : null,
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

  processOrder = async (
    orderId: string,
    body: ProcessOrderDTO,
    currentUser: CurrentUser,
  ) => {
    const { totalWeight, orderItems } = body;

    if (currentUser.role !== Role.OUTLET_ADMIN) {
      throw new ApiError(
        "Hanya outlet admin yang dapat memproses pesanan",
        403,
      );
    }

    const userOutlet = await this.getUserOutlet(currentUser.id);

    const existingOrder = await this.prisma.order.findUnique({
      where: { uuid: orderId },
      include: {
        user: {
          select: {
            deletedAt: true,
            addresses: {
              where: { isPrimary: true },
              select: { latitude: true, longitude: true },
            },
          },
        },
        outlet: {
          select: {
            id: true,
            outletName: true,
            latitude: true,
            longitude: true,
            deliveryBaseFee: true,
            deliveryPerKm: true,
            serviceRadius: true,
          },
        },
      },
    });

    if (!existingOrder) {
      throw new ApiError("Pesanan tidak ditemukan", 404);
    }

    if (existingOrder.user.deletedAt) {
      throw new ApiError("Customer sudah dihapus", 400);
    }

    if (existingOrder.outletId !== userOutlet.outletId) {
      throw new ApiError("Pesanan tidak berada di outlet Anda", 403);
    }

    if (existingOrder.orderStatus !== OrderStatus.ARRIVED_AT_OUTLET) {
      throw new ApiError("Pesanan tidak dalam status untuk diproses", 400);
    }

    let totalDeliveryFee = 0;

    try {
      let customerLat: number | null = null;
      let customerLng: number | null = null;

      if (existingOrder.user.addresses.length > 0) {
        customerLat = existingOrder.user.addresses[0].latitude;
        customerLng = existingOrder.user.addresses[0].longitude;
      } else {
        const anyAddress = await this.prisma.address.findFirst({
          where: { userId: existingOrder.userId },
          select: { latitude: true, longitude: true },
        });

        if (anyAddress) {
          customerLat = anyAddress.latitude;
          customerLng = anyAddress.longitude;
        }
      }

      if (customerLat && customerLng) {
        const distance = DistanceCalculator.calculateDistance(
          existingOrder.outlet.latitude,
          existingOrder.outlet.longitude,
          customerLat,
          customerLng,
        );

        totalDeliveryFee = DistanceCalculator.calculateDeliveryFee(distance, {
          deliveryBaseFee: existingOrder.outlet.deliveryBaseFee,
          deliveryPerKm: existingOrder.outlet.deliveryPerKm,
          serviceRadius: existingOrder.outlet.serviceRadius,
        });

        console.log(
          `📍 Distance: ${distance}km, Delivery Fee: Rp ${totalDeliveryFee.toLocaleString()}`,
        );
      } else {
        totalDeliveryFee = existingOrder.outlet.deliveryBaseFee;
        console.log(
          `⚠️  No customer coordinates found, using base delivery fee: Rp ${totalDeliveryFee.toLocaleString()}`,
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("jangkauan layanan")
      ) {
        throw new ApiError(error.message, 400);
      }

      totalDeliveryFee = existingOrder.outlet.deliveryBaseFee;
      console.log(
        `⚠️  Distance calculation failed, using base delivery fee: Rp ${totalDeliveryFee.toLocaleString()}`,
      );
    }

    const laundryItemIds = orderItems.map((item) => item.laundryItemId);
    const laundryItems = await this.prisma.laundryItem.findMany({
      where: {
        id: { in: laundryItemIds },
        isActive: true,
        deletedAt: null,
      },
    });

    if (laundryItems.length !== laundryItemIds.length) {
      throw new ApiError(
        "Beberapa item laundry tidak valid atau tidak aktif",
        400,
      );
    }

    let calculatedTotalPrice = 0;
    const processedItems: any[] = [];

    for (const orderItem of orderItems) {
      const laundryItem = laundryItems.find(
        (item) => item.id === orderItem.laundryItemId,
      );
      if (!laundryItem) continue;

      let itemPrice = 0;
      let quantity = 0;
      let weight = 0;

      if (laundryItem.pricingType === "PER_PIECE") {
        if (!orderItem.quantity || orderItem.quantity <= 0) {
          throw new ApiError(
            `Quantity untuk ${laundryItem.name} harus diisi dan lebih dari 0`,
            400,
          );
        }
        quantity = orderItem.quantity;
        itemPrice = laundryItem.basePrice * quantity;
      } else if (laundryItem.pricingType === "PER_KG") {
        if (!orderItem.weight || orderItem.weight <= 0) {
          throw new ApiError(
            `Berat untuk ${laundryItem.name} harus diisi dan lebih dari 0`,
            400,
          );
        }
        weight = orderItem.weight;
        itemPrice = laundryItem.basePrice * weight;
      }

      processedItems.push({
        laundryItemId: orderItem.laundryItemId,
        quantity: quantity || null,
        weight: weight || null,
        pricePerUnit: laundryItem.basePrice,
        color: orderItem.color || null,
        brand: orderItem.brand || null,
        materials: orderItem.materials || null,
        totalPrice: itemPrice,
        orderItemDetails: orderItem.orderItemDetails || [],
      });

      calculatedTotalPrice += itemPrice;
    }

    if (!totalWeight || totalWeight <= 0) {
      throw new ApiError("Total berat harus diisi dan lebih dari 0", 400);
    }

    const finalTotalPrice = calculatedTotalPrice + totalDeliveryFee;

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { uuid: orderId },
        data: {
          totalWeight,
          totalPrice: finalTotalPrice,
          totalDeliveryFee: totalDeliveryFee,
          orderStatus: OrderStatus.BEING_WASHED,
          updatedAt: new Date(),
        },
      });

      for (const itemData of processedItems) {
        const { orderItemDetails, ...orderItemMainData } = itemData;

        const createdOrderItem = await tx.orderItem.create({
          data: {
            orderId,
            ...orderItemMainData,
          },
        });

        if (orderItemDetails && orderItemDetails.length > 0) {
          await tx.orderItemDetail.createMany({
            data: orderItemDetails.map((detail: any) => ({
              orderItemId: createdOrderItem.id,
              name: detail.name,
              qty: detail.qty,
            })),
          });
        }
      }

      await tx.notification.create({
        data: {
          message: `Pesanan ${existingOrder.orderNumber} sedang diproses di ${existingOrder.outlet.outletName}`,
          orderStatus: OrderStatus.BEING_WASHED,
          notifType: "ORDER_STARTED",
          role: "CUSTOMER",
          orderId: orderId,
        },
      });

      return updatedOrder;
    });

    return {
      success: true,
      message: "Pesanan berhasil diproses",
      data: {
        orderId: result.uuid,
        orderNumber: result.orderNumber,
        totalWeight: result.totalWeight,
        laundryItemsTotal: calculatedTotalPrice,
        deliveryFee: totalDeliveryFee,
        totalPrice: result.totalPrice,
        orderStatus: result.orderStatus,
      },
    };
  };

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

  getLaundryItems = async () => {
    const items = await this.prisma.laundryItem.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        category: true,
        basePrice: true,
        pricingType: true,
      },
      orderBy: {
        category: "asc",
      },
    });

    return {
      data: items,
    };
  };
}
