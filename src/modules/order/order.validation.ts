import { Role } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";

export interface CurrentUser {
  id: number;
  role: Role;
  outletId?: number;
}

@injectable()
export class OrderValidation {
  constructor(private readonly prisma: PrismaService) {}

  validateOrderDetailAccess = async (
    currentUser: CurrentUser,
    orderId: string,
  ): Promise<any> => {
    const order = await this.prisma.order.findUnique({
      where: { uuid: orderId },
      select: {
        uuid: true,
        orderNumber: true,
        orderStatus: true,
        scheduledPickupTime: true,
        actualPickupTime: true,
        scheduledDeliveryTime: true,
        actualDeliveryTime: true,
        totalDeliveryFee: true,
        totalWeight: true,
        totalPrice: true,
        paymentStatus: true,
        addressLine: true,
        district: true,
        city: true,
        province: true,
        postalCode: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        outletId: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
          },
        },
        outlet: {
          select: {
            id: true,
            outletName: true,
            address: true,
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
            laundryItem: {
              select: {
                id: true,
                name: true,
                category: true,
                pricingType: true,
              },
            },
            orderItemDetails: {
              select: {
                id: true,
                name: true,
                qty: true,
              },
            },
          },
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
                    id: true,
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
                adminNote: true,
                bypassStatus: true,
                createdAt: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
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
        },
      },
    });

    if (!order) {
      throw new ApiError("Order tidak ditemukan", 404);
    }

    await this.validateOrderAccess(currentUser, order.outletId);

    return this.transformOrderDetail(order);
  };

  validateOrderListAccess = async (
    currentUser: CurrentUser,
    outletId?: number,
  ): Promise<{ outletId?: number }> => {
    if (currentUser.role === Role.ADMIN) {
      if (outletId) {
        await this.validateOutlet(outletId);
        return { outletId };
      }
      return {};
    }

    if (currentUser.role === Role.OUTLET_ADMIN) {
      const userOutlet = await this.getUserOutlet(currentUser.id);

      if (outletId && outletId !== userOutlet.outletId) {
        throw new ApiError(
          "Outlet admin hanya bisa melihat order dari outlet sendiri",
          403,
        );
      }

      return { outletId: userOutlet.outletId };
    }

    throw new ApiError("Permission tidak cukup untuk melihat orders", 403);
  };

  validateOrderUpdateAccess = async (
    currentUser: CurrentUser,
    orderId: string,
  ): Promise<any> => {
    const order = await this.validateOrderExists(orderId);
    await this.validateOrderAccess(currentUser, order.outletId);
    return order;
  };

  private async validateOrderAccess(
    currentUser: CurrentUser,
    orderOutletId: number,
  ): Promise<void> {
    if (currentUser.role === Role.ADMIN) {
      return;
    }

    if (currentUser.role === Role.OUTLET_ADMIN) {
      const userOutlet = await this.getUserOutlet(currentUser.id);
      if (orderOutletId !== userOutlet.outletId) {
        throw new ApiError("Anda tidak memiliki akses ke order ini", 403);
      }
      return;
    }

    throw new ApiError("Permission tidak cukup", 403);
  }

  validateOutlet = async (outletId: number): Promise<void> => {
    if (isNaN(outletId) || outletId <= 0) {
      throw new ApiError("Outlet ID tidak valid", 400);
    }

    const outletExists = await this.prisma.outlet.findUnique({
      where: { id: outletId },
      select: { id: true, isActive: true },
    });

    if (!outletExists) {
      throw new ApiError("Outlet tidak ditemukan", 404);
    }
  };

  getUserOutlet = async (userId: number): Promise<{ outletId: number }> => {
    const userEmployee = await this.prisma.employee.findFirst({
      where: { userId },
      select: { outletId: true },
    });

    if (!userEmployee) {
      throw new ApiError("Data employee tidak ditemukan", 400);
    }

    return userEmployee;
  };

  validateOrderExists = async (orderId: string): Promise<any> => {
    const order = await this.prisma.order.findUnique({
      where: { uuid: orderId },
      include: {
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
          },
        },
      },
    });

    if (!order) {
      throw new ApiError("Order tidak ditemukan", 404);
    }

    return order;
  };

  validateSingleOrderAccess = async (
    currentUser: CurrentUser,
    orderId: string,
  ): Promise<any> => {
    const order = await this.validateOrderExists(orderId);
    await this.validateOrderAccess(currentUser, order.outletId);
    return order;
  };

  validateEmployeeExists = async (employeeId: number): Promise<void> => {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });

    if (!employee) {
      throw new ApiError("Employee tidak ditemukan", 404);
    }
  };

  validateCustomerExists = async (customerId: number): Promise<void> => {
    const customer = await this.prisma.user.findUnique({
      where: {
        id: customerId,
        role: Role.CUSTOMER,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!customer) {
      throw new ApiError("Customer tidak ditemukan", 404);
    }
  };

  private transformOrderDetail(order: any): any {
    const workProgress = this.calculateWorkProgress(order.orderWorkProcess);

    const timeline = this.generateOrderTimeline(order);

    const pricingBreakdown = this.calculatePricingBreakdown(
      order.orderItems,
      order.totalDeliveryFee,
      order.totalPrice,
    );

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
      },

      address: {
        fullAddress: order.addressLine,
        district: order.district,
        city: order.city,
        province: order.province,
        postalCode: order.postalCode,
      },

      outlet: order.outlet,

      schedule: {
        scheduledPickupTime: order.scheduledPickupTime,
        actualPickupTime: order.actualPickupTime,
        scheduledDeliveryTime: order.scheduledDeliveryTime,
        actualDeliveryTime: order.actualDeliveryTime,
      },

      totalWeight: order.totalWeight,
      pricing: pricingBreakdown,

      items: order.orderItems.map((item: any) => ({
        id: item.id,
        name: item.laundryItem.name,
        category: item.laundryItem.category,
        quantity: item.quantity,
        weight: item.weight,
        pricePerUnit: item.pricePerUnit,
        totalPrice: item.totalPrice,
        color: item.color,
        brand: item.brand,
        materials: item.materials,
        pricingType: item.laundryItem.pricingType,
        details: item.orderItemDetails,
      })),

      workProcess: {
        progress: workProgress,
        current: order.orderWorkProcess.find((wp: any) => !wp.completedAt)
          ? {
              ...this.transformWorkProcess(
                order.orderWorkProcess.find((wp: any) => !wp.completedAt),
              ),
              station: this.getStationName(
                order.orderWorkProcess.find((wp: any) => !wp.completedAt)
                  .workerType,
              ),
            }
          : null,
        completed: order.orderWorkProcess
          .filter((wp: any) => wp.completedAt)
          .map((wp: any) => ({
            ...this.transformWorkProcess(wp),
            station: this.getStationName(wp.workerType),
            duration: this.calculateDuration(wp.createdAt, wp.completedAt),
          })),
        all: order.orderWorkProcess.map((wp: any) => ({
          ...this.transformWorkProcess(wp),
          station: this.getStationName(wp.workerType),
        })),
      },

      pickup: {
        jobs: order.pickUpJobs.map((job: any) => ({
          id: job.id,
          status: job.status,
          driver: job.employee
            ? {
                id: job.employee.id,
                name: `${job.employee.user.firstName} ${job.employee.user.lastName}`,
                phoneNumber: job.employee.user.phoneNumber,
              }
            : null,
          photos: job.pickUpPhotos ? job.pickUpPhotos.split(",") : [],
          scheduledOutlet: job.pickUpScheduleOutlet,
          notes: job.notes,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })),
        latest:
          order.pickUpJobs.length > 0
            ? order.pickUpJobs[order.pickUpJobs.length - 1]
            : null,
      },

      delivery: {
        jobs: order.deliveryJobs.map((job: any) => ({
          id: job.id,
          status: job.status,
          driver: job.employee
            ? {
                id: job.employee.id,
                name: `${job.employee.user.firstName} ${job.employee.user.lastName}`,
                phoneNumber: job.employee.user.phoneNumber,
              }
            : null,
          photos: job.deliveryPhotos ? job.deliveryPhotos.split(",") : [],
          notes: job.notes,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })),
        latest:
          order.deliveryJobs.length > 0
            ? order.deliveryJobs[order.deliveryJobs.length - 1]
            : null,
      },

      timeline: timeline,

      metadata: {
        totalItems: order.orderItems.length,
        totalProcesses: order.orderWorkProcess.length,
        completedProcesses: order.orderWorkProcess.filter(
          (wp: any) => wp.completedAt,
        ).length,
        hasActiveBypass: order.orderWorkProcess.some(
          (wp: any) => wp.bypass && wp.bypass.bypassStatus === "PENDING",
        ),
        estimatedCompletion: this.estimateCompletion(order),
      },
    };
  }

  private transformWorkProcess(wp: any): any {
    return {
      id: wp.id,
      workerType: wp.workerType,
      worker: wp.employee
        ? {
            id: wp.employee.id,
            name: `${wp.employee.user.firstName} ${wp.employee.user.lastName}`,
          }
        : null,
      notes: wp.notes,
      completedAt: wp.completedAt,
      createdAt: wp.createdAt,
      bypass: wp.bypass,
      isCompleted: !!wp.completedAt,
    };
  }

  private calculateWorkProgress(workProcesses: any[]): any {
    const stages = ["WASHING", "IRONING", "PACKING"];
    const stageStatus = stages.map((stage) => {
      const process = workProcesses.find((wp) => wp.workerType === stage);
      if (!process) return { stage, status: "PENDING", progress: 0 };
      if (process.completedAt)
        return { stage, status: "COMPLETED", progress: 100 };
      return { stage, status: "IN_PROGRESS", progress: 50 };
    });

    const completedStages = stageStatus.filter(
      (s) => s.status === "COMPLETED",
    ).length;
    const totalProgress = Math.round((completedStages / stages.length) * 100);

    return {
      stages: stageStatus,
      overall: {
        completed: completedStages,
        total: stages.length,
        percentage: totalProgress,
      },
    };
  }

  private generateOrderTimeline(order: any): any[] {
    const timeline: any[] = [];

    timeline.push({
      id: `order-created-${order.uuid}`,
      event: "Order Created",
      type: "ORDER",
      status: "COMPLETED",
      timestamp: order.createdAt,
      description: "Customer created pickup request",
      icon: "📝",
    });

    order.pickUpJobs?.forEach((pickup: any) => {
      timeline.push({
        id: `pickup-${pickup.id}`,
        event: "Pickup Assigned",
        type: "PICKUP",
        status: pickup.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
        timestamp: pickup.createdAt,
        description: pickup.employee
          ? `Assigned to ${pickup.employee.user.firstName} ${pickup.employee.user.lastName}`
          : "Driver assigned",
        icon: "🚚",
        metadata: {
          driver: pickup.employee
            ? `${pickup.employee.user.firstName} ${pickup.employee.user.lastName}`
            : null,
          notes: pickup.notes,
        },
      });
    });

    order.orderWorkProcess?.forEach((wp: any) => {
      const stationName = this.getStationName(wp.workerType);
      const workerName = wp.employee
        ? `${wp.employee.user.firstName} ${wp.employee.user.lastName}`
        : "Unknown";

      timeline.push({
        id: `work-start-${wp.id}`,
        event: `${stationName} Started`,
        type: "WORK_PROCESS",
        status: wp.completedAt ? "COMPLETED" : "IN_PROGRESS",
        timestamp: wp.createdAt,
        description: `${workerName} started work at ${stationName}`,
        icon: this.getStationIcon(wp.workerType),
        metadata: {
          worker: workerName,
          workerType: wp.workerType,
          station: stationName,
          notes: wp.notes,
          hasBypass: !!wp.bypass,
        },
      });

      if (wp.completedAt) {
        timeline.push({
          id: `work-complete-${wp.id}`,
          event: `${stationName} Completed`,
          type: "WORK_PROCESS",
          status: "COMPLETED",
          timestamp: wp.completedAt,
          description: `Work completed in ${this.calculateDuration(wp.createdAt, wp.completedAt)}`,
          icon: "✅",
          metadata: {
            duration: this.calculateDuration(wp.createdAt, wp.completedAt),
          },
        });
      }
    });

    order.deliveryJobs?.forEach((delivery: any) => {
      timeline.push({
        id: `delivery-${delivery.id}`,
        event: "Delivery Started",
        type: "DELIVERY",
        status: delivery.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
        timestamp: delivery.createdAt,
        description: delivery.employee
          ? `${delivery.employee.user.firstName} ${delivery.employee.user.lastName} started delivery`
          : "Delivery started",
        icon: "🚛",
        metadata: {
          driver: delivery.employee
            ? `${delivery.employee.user.firstName} ${delivery.employee.user.lastName}`
            : null,
          notes: delivery.notes,
        },
      });
    });

    return timeline.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  private calculatePricingBreakdown(
    orderItems: any[],
    deliveryFee: number,
    totalPrice: number,
  ): any {
    const itemsTotal = orderItems.reduce(
      (sum, item) => sum + item.totalPrice,
      0,
    );

    return {
      items: {
        total: itemsTotal,
        breakdown: orderItems.map((item) => ({
          name: item.laundryItem.name,
          quantity: item.quantity,
          weight: item.weight,
          pricePerUnit: item.pricePerUnit,
          totalPrice: item.totalPrice,
          pricingType: item.laundryItem.pricingType,
        })),
      },
      delivery: {
        fee: deliveryFee || 0,
      },
      total: totalPrice || itemsTotal + (deliveryFee || 0),
    };
  }

  private getStationName(workerType: string): string {
    const stations = {
      WASHING: "Washing Station",
      IRONING: "Ironing Station",
      PACKING: "Packing Station",
    };
    return stations[workerType as keyof typeof stations] || workerType;
  }

  private getStationIcon(workerType: string): string {
    const icons = {
      WASHING: "🧼",
      IRONING: "👔",
      PACKING: "📦",
    };
    return icons[workerType as keyof typeof icons] || "🔧";
  }

  private calculateDuration(
    startDate: Date | string,
    endDate: Date | string,
  ): string {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  private estimateCompletion(order: any): string | null {
    if (
      order.orderStatus === "COMPLETED" ||
      order.orderStatus === "DELIVERED_TO_CUSTOMER"
    ) {
      return null;
    }

    const currentTime = new Date();
    let estimatedHours = 0;

    switch (order.orderStatus) {
      case "BEING_WASHED":
        estimatedHours = 24;
        break;
      case "BEING_IRONED":
        estimatedHours = 12;
        break;
      case "BEING_PACKED":
        estimatedHours = 4;
        break;
      case "READY_FOR_DELIVERY":
        estimatedHours = 8;
        break;
      default:
        estimatedHours = 48;
    }

    const estimatedCompletion = new Date(
      currentTime.getTime() + estimatedHours * 60 * 60 * 1000,
    );
    return estimatedCompletion.toISOString();
  }
}
