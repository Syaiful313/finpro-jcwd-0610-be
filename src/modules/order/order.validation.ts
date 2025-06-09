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
        address_line: true,
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

  private transformOrderDetail(order: any): any {
    return {
      ...order,
      customer: {
        id: order.user.id,
        name: `${order.user.firstName} ${order.user.lastName}`,
        email: order.user.email,
        phoneNumber: order.user.phoneNumber,
      },
      address: {
        fullAddress: order.address_line,
        district: order.district,
        city: order.city,
        province: order.province,
        postalCode: order.postalCode,
      },
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
      workProcesses: order.orderWorkProcess.map((wp: any) => ({
        id: wp.id,
        workerType: wp.workerType,
        worker: {
          id: wp.employee.id,
          name: `${wp.employee.user.firstName} ${wp.employee.user.lastName}`,
        },
        notes: wp.notes,
        completedAt: wp.completedAt,
        createdAt: wp.createdAt,
        bypass: wp.bypass,
      })),
      pickupInfo: order.pickUpJobs.map((job: any) => ({
        id: job.id,
        status: job.status,
        driver: {
          id: job.employee.id,
          name: `${job.employee.user.firstName} ${job.employee.user.lastName}`,
          phoneNumber: job.employee.user.phoneNumber,
        },
        photos: job.pickUpPhotos,
        scheduledOutlet: job.pickUpScheduleOutlet,
        notes: job.notes,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
      deliveryInfo: order.deliveryJobs.map((job: any) => ({
        id: job.id,
        status: job.status,
        driver: {
          id: job.employee.id,
          name: `${job.employee.user.firstName} ${job.employee.user.lastName}`,
          phoneNumber: job.employee.user.phoneNumber,
        },
        photos: job.deliveryPhotos,
        notes: job.notes,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
    };
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
}
