import {
  DriverTaskStatus,
  OrderStatus,
  Prisma,
  Role,
  WorkerTypes,
} from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { DistanceCalculator } from "../../utils/distance.calculator";
import { haversine } from "../../utils/haversine-distance";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePickupOrderDTO } from "./dto/createPickupAndOrder.dto";
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
  private static readonly STATION_NAMES = {
    WASHING: "Washing Station",
    IRONING: "Ironing Station",
    PACKING: "Packing Station",
  } as const;

  private static readonly DEFAULT_MESSAGES = {
    DRIVER_NOT_AVAILABLE: "Driver tidak tersedia",
    WORKER_NOT_AVAILABLE: "Worker tidak tersedia",
  } as const;

  private static readonly WORK_STAGES = [
    { stage: "WASHING", status: WorkerTypes.WASHING, label: "Washing" },
    { stage: "IRONING", status: WorkerTypes.IRONING, label: "Ironing" },
    { stage: "PACKING", status: WorkerTypes.PACKING, label: "Packing" },
  ] as const;

  private static readonly ERROR_MESSAGES = {
    ORDER_NOT_FOUND: "Order tidak ditemukan",
    INSUFFICIENT_PERMISSION: "Permission tidak cukup",
    OUTLET_ADMIN_ONLY: "Hanya outlet admin yang dapat memproses pesanan",
    INVALID_ORDER_STATUS: "Status order tidak valid",
    INVALID_DATE_FORMAT: "Format tanggal tidak valid",
    INVALID_EMPLOYEE_ID: "Employee ID tidak valid",
    INVALID_OUTLET_ID: "Outlet ID tidak valid",
    OUTLET_NOT_FOUND: "Outlet tidak ditemukan",
    EMPLOYEE_NOT_FOUND: "Employee tidak ditemukan",
  } as const;

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
    } = query;

    await this.validateQueryInputs(query, currentUser);

    const whereClause = await this.buildOrdersWhereClause(query, currentUser);
    const selectClause = this.getOrdersSelectClause();

    const [orders, count] = await Promise.all([
      this.prisma.order.findMany({
        where: whereClause,
        select: selectClause,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.order.count({ where: whereClause }),
    ]);

    return {
      data: this.transformOrdersList(orders),
      meta: this.paginationService.generateMeta({ page, take, count }),
    };
  };

  getOrderDetail = async (orderId: string, currentUser: CurrentUser) => {
    this.validateOrderDetailAccess(currentUser);

    const whereClause = await this.buildOrderDetailWhereClause(
      orderId,
      currentUser,
    );

    const order = await this.fetchOrderDetail(whereClause);

    if (!order) {
      throw new ApiError(OrderService.ERROR_MESSAGES.ORDER_NOT_FOUND, 404);
    }

    return this.transformOrderDetail(order);
  };

  getPendingProcessOrders = async (
    query: GetPendingOrdersDTO,
    currentUser: CurrentUser,
  ) => {
    this.validateOutletAdminRole(currentUser);

    const {
      page = 1,
      take = 10,
      sortBy = "createdAt",
      sortOrder = "asc",
    } = query;
    const userOutlet = await this.getUserOutlet(currentUser.id);
    const whereClause = this.buildPendingOrdersWhereClause(
      query,
      userOutlet.outletId,
    );

    const [orders, count] = await Promise.all([
      this.prisma.order.findMany({
        where: whereClause,
        select: this.getPendingOrdersSelectClause(),
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.order.count({ where: whereClause }),
    ]);

    return {
      data: this.transformPendingOrdersList(orders),
      meta: this.paginationService.generateMeta({ page, take, count }),
    };
  };

  processOrder = async (
    orderId: string,
    body: ProcessOrderDTO,
    currentUser: CurrentUser,
  ) => {
    this.validateOutletAdminRole(currentUser);

    const { totalWeight, orderItems } = body;
    const userOutlet = await this.getUserOutlet(currentUser.id);

    const existingOrder = await this.validateOrderForProcessing(
      orderId,
      userOutlet.outletId,
    );

    const totalDeliveryFee =
      await this.calculateOrderDeliveryFee(existingOrder);

    const { processedItems, calculatedTotalPrice } =
      await this.processOrderItems(orderItems);

    this.validateOrderWeight(totalWeight);

    const finalTotalPrice = calculatedTotalPrice + totalDeliveryFee;

    const result = await this.executeOrderProcessing({
      orderId,
      totalWeight,
      finalTotalPrice,
      totalDeliveryFee,
      processedItems,
      existingOrder,
    });

    return this.buildProcessOrderResponse(
      result,
      calculatedTotalPrice,
      totalDeliveryFee,
    );
  };

  getLaundryItems = async () => {
    const items = await this.prisma.laundryItem.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        category: true,
        basePrice: true,
        pricingType: true,
      },
      orderBy: { category: Prisma.SortOrder.asc },
    });

    return { data: items };
  };

  private validateQueryInputs = async (
    query: GetOrdersDTO,
    currentUser: CurrentUser,
  ): Promise<void> => {
    const { status, startDate, endDate, employeeId, outletId } = query;

    if (status && !Object.values(OrderStatus).includes(status)) {
      throw new ApiError(OrderService.ERROR_MESSAGES.INVALID_ORDER_STATUS, 400);
    }

    this.validateDateInputs(startDate, endDate);
    this.validateNumericInputs(employeeId, outletId);

    if (currentUser.role === Role.OUTLET_ADMIN && outletId) {
      await this.validateOutletAdminOutletAccess(currentUser.id, outletId);
    }
  };

  private validateDateInputs(startDate?: string, endDate?: string): void {
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
  }

  private validateNumericInputs(employeeId?: string, outletId?: string): void {
    if (
      employeeId &&
      (isNaN(parseInt(employeeId)) || parseInt(employeeId) <= 0)
    ) {
      throw new ApiError(OrderService.ERROR_MESSAGES.INVALID_EMPLOYEE_ID, 400);
    }
    if (outletId && (isNaN(parseInt(outletId)) || parseInt(outletId) <= 0)) {
      throw new ApiError(OrderService.ERROR_MESSAGES.INVALID_OUTLET_ID, 400);
    }
  }

  private validateOrderDetailAccess(currentUser: CurrentUser): void {
    if (
      !([Role.ADMIN, Role.OUTLET_ADMIN] as Role[]).includes(currentUser.role)
    ) {
      throw new ApiError(
        "Permission tidak cukup untuk melihat detail order",
        403,
      );
    }
  }

  private validateOutletAdminRole(currentUser: CurrentUser): void {
    if (currentUser.role !== Role.OUTLET_ADMIN) {
      throw new ApiError(OrderService.ERROR_MESSAGES.OUTLET_ADMIN_ONLY, 403);
    }
  }

  private validateOrderWeight(totalWeight: number): void {
    if (!totalWeight || totalWeight <= 0) {
      throw new ApiError("Total berat harus diisi dan lebih dari 0", 400);
    }
  }

  private async validateOutletAdminOutletAccess(
    userId: number,
    outletId: string,
  ): Promise<void> {
    const userOutlet = await this.getUserOutlet(userId);
    if (parseInt(outletId) !== userOutlet.outletId) {
      throw new ApiError("Outlet admin hanya bisa filter outlet sendiri", 403);
    }
  }

  private async validateOrderForProcessing(
    orderId: string,
    userOutletId: number,
  ) {
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
    if (existingOrder.outletId !== userOutletId) {
      throw new ApiError("Pesanan tidak berada di outlet Anda", 403);
    }
    if (existingOrder.orderStatus !== OrderStatus.ARRIVED_AT_OUTLET) {
      throw new ApiError("Pesanan tidak dalam status untuk diproses", 400);
    }

    return existingOrder;
  }

  private async validateOutlet(outletId: number): Promise<void> {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: outletId },
      select: { id: true, isActive: true },
    });

    if (!outlet) {
      throw new ApiError(OrderService.ERROR_MESSAGES.OUTLET_NOT_FOUND, 404);
    }
  }

  private async validateEmployee(employeeId: number): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });

    if (!employee) {
      throw new ApiError(OrderService.ERROR_MESSAGES.EMPLOYEE_NOT_FOUND, 404);
    }
  }

  private async buildOrdersWhereClause(
    query: GetOrdersDTO,
    currentUser: CurrentUser,
  ): Promise<Prisma.OrderWhereInput> {
    const { search, status, outletId, employeeId, startDate, endDate } = query;

    const where: Prisma.OrderWhereInput = {
      user: { deletedAt: null },
    };

    await this.applyRoleBasedFiltering(where, currentUser, outletId);

    if (status) where.orderStatus = status;
    if (search) where.AND = this.buildSearchConditions(search);
    if (employeeId) this.applyEmployeeFilter(where, employeeId);
    if (startDate || endDate)
      where.createdAt = this.buildDateFilter(startDate, endDate);

    return where;
  }

  private async buildOrderDetailWhereClause(
    orderId: string,
    currentUser: CurrentUser,
  ): Promise<Prisma.OrderWhereInput> {
    const whereClause: Prisma.OrderWhereInput = {
      uuid: orderId,
      user: { deletedAt: null },
    };

    if (currentUser.role === Role.OUTLET_ADMIN) {
      const userOutlet = await this.getUserOutlet(currentUser.id);
      whereClause.outletId = userOutlet.outletId;
    }

    return whereClause;
  }

  private buildPendingOrdersWhereClause(
    query: GetPendingOrdersDTO,
    outletId: number,
  ): Prisma.OrderWhereInput {
    const { search, customerName } = query;

    const where: Prisma.OrderWhereInput = {
      outletId,
      orderStatus: OrderStatus.ARRIVED_AT_OUTLET,
      user: { deletedAt: null },
    };

    const andConditions: Prisma.OrderWhereInput[] = [];

    if (search) andConditions.push(this.buildSearchConditions(search));
    if (customerName)
      andConditions.push(this.buildCustomerNameFilter(customerName));
    if (andConditions.length > 0) where.AND = andConditions;

    return where;
  }

  private async applyRoleBasedFiltering(
    where: Prisma.OrderWhereInput,
    currentUser: CurrentUser,
    outletId?: string,
  ): Promise<void> {
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
      throw new ApiError(
        OrderService.ERROR_MESSAGES.INSUFFICIENT_PERMISSION,
        403,
      );
    }
  }

  private buildSearchConditions(search: string): Prisma.OrderWhereInput {
    return {
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
    };
  }

  private buildCustomerNameFilter(
    customerName: string,
  ): Prisma.OrderWhereInput {
    return {
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
    };
  }

  private applyEmployeeFilter(
    where: Prisma.OrderWhereInput,
    employeeId: string,
  ): void {
    const andConditions = (where.AND as Prisma.OrderWhereInput[]) || [];

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

    where.AND = andConditions;
  }

  private buildDateFilter(startDate?: string, endDate?: string): any {
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate + "T00:00:00.000Z");
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate + "T23:59:59.999Z");
    }
    return dateFilter;
  }

  private getOrdersSelectClause() {
    return {
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
          createdAt: Prisma.SortOrder.asc,
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
  }

  private getPendingOrdersSelectClause() {
    return {
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
          status: DriverTaskStatus.COMPLETED,
        },
        orderBy: {
          createdAt: Prisma.SortOrder.desc,
        },
        take: 1,
      },
    };
  }

  private transformOrdersList(orders: any[]): any[] {
    return orders.map((order) => {
      const currentWorkProcess = this.findCurrentWorkProcess(
        order.orderWorkProcess,
      );
      const completedProcesses = this.getCompletedProcesses(
        order.orderWorkProcess,
      );

      return {
        uuid: order.uuid,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        totalWeight: order.totalWeight,
        totalPrice: order.totalPrice,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        customer: this.transformCustomerInfo(order.user),
        outlet: order.outlet,
        tracking: this.buildOrderTracking(
          order,
          currentWorkProcess,
          completedProcesses,
        ),
      };
    });
  }

  private transformPendingOrdersList(orders: any[]): any[] {
    return orders.map((order) => {
      const customerCoordinates = this.extractCustomerCoordinates(
        order.user.addresses,
      );

      return {
        uuid: order.uuid,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        scheduledPickupTime: order.scheduledPickupTime,
        actualPickupTime: order.actualPickupTime,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        customer: this.transformCustomerInfo(order.user),
        address: this.transformOrderAddress(order),
        customerCoordinates,
        outlet: order.outlet,
        pickupInfo: this.transformPickupInfo(order.pickUpJobs[0]),
      };
    });
  }

  private transformOrderDetail(order: any): any {
    const deliveryInfo = this.calculateDetailedDeliveryInfo(order);
    const workProcesses = this.categorizeWorkProcesses(order.orderWorkProcess);
    const detailedTimeline = this.generateDetailedTimeline(order);
    const pricing = this.calculatePricingBreakdown(order);
    const paymentInfo = this.transformPaymentInfo(order);

    return {
      uuid: order.uuid,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customer: this.transformDetailedCustomerInfo(order.user),
      outlet: order.outlet,
      deliveryAddress: this.transformOrderAddress(order),
      schedule: this.transformOrderSchedule(order),
      items: this.transformOrderItems(order.orderItems),
      pricing,
      payment: paymentInfo,
      delivery: this.transformDeliveryInfo(order, deliveryInfo),
      pickup: this.transformPickupJobsInfo(order.pickUpJobs),
      workProcess: this.transformWorkProcessInfo(
        workProcesses,
        order.orderStatus,
      ),
      notifications: order.notifications,
      timeline: detailedTimeline,
    };
  }

  private findCurrentWorkProcess(workProcesses?: any[]): any | null {
    return workProcesses?.find((wp) => !wp.completedAt) || null;
  }

  private getCompletedProcesses(workProcesses?: any[]): any[] {
    return workProcesses?.filter((wp) => wp.completedAt) || [];
  }

  private transformCustomerInfo(user: any): any {
    return {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
    };
  }

  private transformDetailedCustomerInfo(user: any): any {
    const primaryAddress =
      user.addresses?.find((addr: any) => addr.isPrimary) ||
      user.addresses?.[0];

    return {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phoneNumber: user.phoneNumber,
      addresses: user.addresses,
      primaryAddress,
    };
  }

  private transformOrderAddress(order: any): any {
    return {
      fullAddress: order.addressLine,
      district: order.district,
      city: order.city,
      province: order.province,
      postalCode: order.postalCode,
    };
  }

  private transformOrderSchedule(order: any): any {
    return {
      scheduledPickupTime: order.scheduledPickupTime,
      actualPickupTime: order.actualPickupTime,
      scheduledDeliveryTime: order.scheduledDeliveryTime,
      actualDeliveryTime: order.actualDeliveryTime,
    };
  }

  private extractCustomerCoordinates(addresses: any[]): any {
    return addresses.length > 0
      ? {
          latitude: addresses[0].latitude,
          longitude: addresses[0].longitude,
        }
      : null;
  }

  private transformPickupInfo(pickupJob: any): any {
    if (!pickupJob) return null;

    return {
      driver: this.getDriverName(pickupJob.employee),
      driverPhone: pickupJob.employee?.user?.phoneNumber,
      scheduledOutlet: pickupJob.pickUpScheduleOutlet,
      notes: pickupJob.notes,
      completedAt: pickupJob.createdAt,
    };
  }

  private transformPickupJobsInfo(pickUpJobs: any[]): any {
    return {
      jobs: pickUpJobs.map((job: any) => ({
        id: job.id,
        status: job.status,
        driver: this.getDriverName(job.employee),
        driverPhone: job.employee?.user?.phoneNumber,
        photos: job.pickUpPhotos,
        scheduledOutlet: job.pickUpScheduleOutlet,
        notes: job.notes,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
    };
  }

  private buildOrderTracking(
    order: any,
    currentWorkProcess: any,
    completedProcesses: any[],
  ): any {
    return {
      currentWorker: this.transformCurrentWorker(currentWorkProcess),
      processHistory: this.transformProcessHistory(completedProcesses),
      pickup: this.transformTrackingPickup(order.pickUpJobs?.[0]),
      delivery: this.transformTrackingDelivery(order.deliveryJobs?.[0]),
      timeline: this.generateOrderTimeline(order),
    };
  }

  private transformCurrentWorker(workProcess: any): any {
    if (!workProcess) return null;

    return {
      id: workProcess.employee.id,
      name: this.getWorkerName(workProcess.employee),
      workerType: workProcess.workerType,
      station: this.getStationName(workProcess.workerType),
      startedAt: workProcess.createdAt,
      notes: workProcess.notes,
      hasBypass: !!workProcess.bypass,
    };
  }

  private transformProcessHistory(completedProcesses: any[]): any[] {
    return completedProcesses.map((wp) => ({
      station: this.getStationName(wp.workerType),
      worker: this.getWorkerName(wp.employee),
      startedAt: wp.createdAt,
      completedAt: wp.completedAt,
      duration: this.calculateDuration(wp.createdAt, wp.completedAt!),
      notes: wp.notes,
      hasBypass: !!wp.bypass,
    }));
  }

  private transformTrackingPickup(pickupJob: any): any {
    if (!pickupJob) return null;

    return {
      id: pickupJob.id,
      driver: this.getDriverName(pickupJob.employee),
      status: pickupJob.status,
      assignedAt: pickupJob.createdAt,
      lastUpdate: pickupJob.updatedAt,
    };
  }

  private transformTrackingDelivery(deliveryJob: any): any {
    if (!deliveryJob) return null;

    return {
      id: deliveryJob.id,
      driver: this.getDriverName(deliveryJob.employee),
      status: deliveryJob.status,
      assignedAt: deliveryJob.createdAt,
      lastUpdate: deliveryJob.updatedAt,
    };
  }

  private getStationName(workerType: WorkerTypes): string {
    return OrderService.STATION_NAMES[workerType];
  }

  private getWorkerName(employee: any): string {
    return employee?.user
      ? `${employee.user.firstName} ${employee.user.lastName}`
      : OrderService.DEFAULT_MESSAGES.WORKER_NOT_AVAILABLE;
  }

  private getDriverName(employee: any): string {
    return employee?.user
      ? `${employee.user.firstName} ${employee.user.lastName}`
      : OrderService.DEFAULT_MESSAGES.DRIVER_NOT_AVAILABLE;
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

  private async fetchOrderDetail(whereClause: Prisma.OrderWhereInput) {
    return await this.prisma.order.findFirst({
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
        xenditId: true,
        invoiceUrl: true,
        successRedirectUrl: true,
        xenditExpiryDate: true,
        xenditPaymentStatus: true,
        paidAt: true,
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
              orderBy: { isPrimary: Prisma.SortOrder.desc },
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
              orderBy: { name: Prisma.SortOrder.asc },
            },
          },
          orderBy: { createdAt: Prisma.SortOrder.asc },
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
          orderBy: { createdAt: Prisma.SortOrder.desc },
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
          orderBy: { createdAt: Prisma.SortOrder.desc },
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
          orderBy: { createdAt: Prisma.SortOrder.asc },
        },
        notifications: {
          select: {
            id: true,
            message: true,
            orderStatus: true,
            notifType: true,
            role: true,
            readByUserIds: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  private calculateDetailedDeliveryInfo(order: any): any {
    const primaryAddress =
      order.user.addresses.find((addr: any) => addr.isPrimary) ||
      order.user.addresses[0];

    if (!primaryAddress || !order.outlet) return null;

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

      return {
        distance: parseFloat(distance.toFixed(2)),
        calculatedFee: calculatedDeliveryFee,
        actualFee: order.totalDeliveryFee,
        baseFee: order.outlet.deliveryBaseFee,
        perKmFee: order.outlet.deliveryPerKm,
        withinServiceRadius: distance <= order.outlet.serviceRadius,
      };
    } catch (error) {
      console.warn("Failed to calculate delivery info:", error);
      return null;
    }
  }

  private categorizeWorkProcesses(orderWorkProcess: any[]): any {
    return {
      current: orderWorkProcess.find((wp) => !wp.completedAt),
      completed: orderWorkProcess.filter((wp) => wp.completedAt),
      all: orderWorkProcess,
    };
  }

  private calculatePricingBreakdown(order: any): any {
    const itemsTotal = order.orderItems.reduce(
      (sum: number, item: any) => sum + item.totalPrice,
      0,
    );

    return {
      items: itemsTotal,
      delivery: order.totalDeliveryFee || 0,
      total: order.totalPrice || 0,
      breakdown: order.orderItems.map((item: any) => ({
        name: item.laundryItem.name,
        category: item.laundryItem.category,
        pricingType: item.laundryItem.pricingType,
        quantity: item.quantity,
        weight: item.weight,
        pricePerUnit: item.pricePerUnit,
        totalPrice: item.totalPrice,
      })),
    };
  }

  private transformOrderItems(orderItems: any[]): any[] {
    return orderItems.map((item) => ({
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
    }));
  }

  private transformDeliveryInfo(order: any, deliveryInfo: any): any {
    return {
      info: deliveryInfo,
      totalWeight: order.totalWeight,
      jobs: order.deliveryJobs.map((job: any) => ({
        id: job.id,
        status: job.status,
        driver: this.getDriverName(job.employee),
        driverPhone: job.employee?.user?.phoneNumber,
        photos: job.deliveryPhotos,
        notes: job.notes,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
    };
  }

  private transformWorkProcessInfo(
    workProcesses: any,
    orderStatus: OrderStatus,
  ): any {
    return {
      current: workProcesses.current
        ? {
            id: workProcesses.current.id,
            type: workProcesses.current.workerType,
            station: this.getStationName(workProcesses.current.workerType),
            worker: this.getWorkerName(workProcesses.current.employee),
            workerPhone: workProcesses.current.employee?.user?.phoneNumber,
            startedAt: workProcesses.current.createdAt,
            notes: workProcesses.current.notes,
            bypass: workProcesses.current.bypass,
          }
        : null,
      completed: workProcesses.completed.map((wp: any) => ({
        id: wp.id,
        type: wp.workerType,
        station: this.getStationName(wp.workerType),
        worker: this.getWorkerName(wp.employee),
        workerPhone: wp.employee?.user?.phoneNumber,
        startedAt: wp.createdAt,
        completedAt: wp.completedAt,
        duration: wp.completedAt
          ? this.calculateDuration(wp.createdAt, wp.completedAt)
          : null,
        notes: wp.notes,
        bypass: wp.bypass,
      })),
      progress: this.calculateWorkProgress(orderStatus, workProcesses.all),
    };
  }

  private calculateWorkProgress(
    orderStatus: OrderStatus,
    workProcesses: any[],
  ): any {
    const progress = OrderService.WORK_STAGES.map((stage) => {
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
        worker: this.getWorkerName(process.employee),
      };
    });

    const completedStages = progress.filter(
      (p) => p.status === "COMPLETED",
    ).length;
    const inProgressStages = progress.filter(
      (p) => p.status === "IN_PROGRESS",
    ).length;
    const totalStages = OrderService.WORK_STAGES.length;

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

  private async calculateOrderDeliveryFee(existingOrder: any): Promise<number> {
    try {
      const customerCoordinates = await this.getCustomerCoordinates(
        existingOrder.userId,
      );

      if (customerCoordinates) {
        const distance = DistanceCalculator.calculateDistance(
          existingOrder.outlet.latitude,
          existingOrder.outlet.longitude,
          customerCoordinates.latitude,
          customerCoordinates.longitude,
        );

        const deliveryFee = DistanceCalculator.calculateDeliveryFee(distance, {
          deliveryBaseFee: existingOrder.outlet.deliveryBaseFee,
          deliveryPerKm: existingOrder.outlet.deliveryPerKm,
          serviceRadius: existingOrder.outlet.serviceRadius,
        });

        console.log(
          `📍 Distance: ${distance}km, Delivery Fee: Rp ${deliveryFee.toLocaleString()}`,
        );
        return deliveryFee;
      } else {
        console.log(
          `⚠️  No customer coordinates found, using base delivery fee: Rp ${existingOrder.outlet.deliveryBaseFee.toLocaleString()}`,
        );
        return existingOrder.outlet.deliveryBaseFee;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("jangkauan layanan")
      ) {
        throw new ApiError(error.message, 400);
      }

      console.log(
        `⚠️  Distance calculation failed, using base delivery fee: Rp ${existingOrder.outlet.deliveryBaseFee.toLocaleString()}`,
      );
      return existingOrder.outlet.deliveryBaseFee;
    }
  }

  private async getCustomerCoordinates(
    userId: number,
  ): Promise<{ latitude: number; longitude: number } | null> {
    const primaryAddress = await this.prisma.address.findFirst({
      where: { userId, isPrimary: true },
      select: { latitude: true, longitude: true },
    });

    if (primaryAddress) return primaryAddress;

    const anyAddress = await this.prisma.address.findFirst({
      where: { userId },
      select: { latitude: true, longitude: true },
    });

    return anyAddress;
  }

  private async processOrderItems(
    orderItems: any[],
  ): Promise<{ processedItems: any[]; calculatedTotalPrice: number }> {
    const laundryItemIds = orderItems.map((item) => item.laundryItemId);
    const laundryItems = await this.validateLaundryItems(laundryItemIds);

    let calculatedTotalPrice = 0;
    const processedItems: any[] = [];

    for (const orderItem of orderItems) {
      const laundryItem = laundryItems.find(
        (item) => item.id === orderItem.laundryItemId,
      );
      if (!laundryItem) continue;

      const { quantity, weight, itemPrice } = this.calculateItemPricing(
        orderItem,
        laundryItem,
      );

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

    return { processedItems, calculatedTotalPrice };
  }

  private async validateLaundryItems(laundryItemIds: number[]): Promise<any[]> {
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

    return laundryItems;
  }

  private calculateItemPricing(
    orderItem: any,
    laundryItem: any,
  ): { quantity: number; weight: number; itemPrice: number } {
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

    return { quantity, weight, itemPrice };
  }

  private async executeOrderProcessing(params: {
    orderId: string;
    totalWeight: number;
    finalTotalPrice: number;
    totalDeliveryFee: number;
    processedItems: any[];
    existingOrder: any;
  }): Promise<any> {
    const {
      orderId,
      totalWeight,
      finalTotalPrice,
      totalDeliveryFee,
      processedItems,
      existingOrder,
    } = params;

    return await this.prisma.$transaction(async (tx) => {
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
          notifType: "ORDER_STARTED",
          role: "CUSTOMER",
          orderId: orderId,
        },
      });

      return updatedOrder;
    });
  }

  private buildProcessOrderResponse(
    result: any,
    calculatedTotalPrice: number,
    totalDeliveryFee: number,
  ): any {
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
  }

  private generateDetailedTimeline(order: any): any[] {
    const timeline: any[] = [];

    this.addOrderCreatedEvent(timeline, order);
    this.addPickupEvents(timeline, order.pickUpJobs);
    this.addWorkProcessEvents(timeline, order.orderWorkProcess);
    this.addDeliveryEvents(timeline, order.deliveryJobs);
    this.addNotificationEvents(timeline, order.notifications);

    return this.sortTimelineByTimestamp(timeline);
  }

  private generateOrderTimeline(order: any): any[] {
    const timeline: any[] = [];

    timeline.push({
      event: "Order Created",
      timestamp: order.createdAt,
      status: "COMPLETED",
      description: "Customer request pickup created",
    });

    this.addPickupTimelineEvents(timeline, order.pickUpJobs);
    this.addWorkProcessTimelineEvents(timeline, order.orderWorkProcess);
    this.addDeliveryTimelineEvents(timeline, order.deliveryJobs);

    return this.sortTimelineByTimestamp(timeline);
  }

  private addOrderCreatedEvent(timeline: any[], order: any): void {
    timeline.push({
      id: `order-created-${order.uuid}`,
      event: "Order Created",
      type: "ORDER",
      status: "COMPLETED",
      timestamp: order.createdAt,
      description: "Customer created pickup request",
      metadata: {
        orderNumber: order.orderNumber,
        totalItems: order.orderItems?.length || 0,
      },
    });
  }

  private addPickupEvents(timeline: any[], pickUpJobs: any[]): void {
    pickUpJobs?.forEach((pickup: any) => {
      timeline.push({
        id: `pickup-assigned-${pickup.id}`,
        event: "Pickup Assigned",
        type: "PICKUP",
        status: "COMPLETED",
        timestamp: pickup.createdAt,
        description: `Pickup assigned to driver`,
        metadata: {
          driver: this.getDriverName(pickup.employee),
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
            driver: this.getDriverName(pickup.employee),
            scheduledOutlet: pickup.pickUpScheduleOutlet,
            photos: pickup.pickUpPhotos,
          },
        });
      }
    });
  }

  private addWorkProcessEvents(timeline: any[], orderWorkProcess: any[]): void {
    orderWorkProcess?.forEach((wp: any) => {
      const workerName = this.getWorkerName(wp.employee);

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
  }

  private addDeliveryEvents(timeline: any[], deliveryJobs: any[]): void {
    deliveryJobs?.forEach((delivery: any) => {
      timeline.push({
        id: `delivery-assigned-${delivery.id}`,
        event: "Delivery Assigned",
        type: "DELIVERY",
        status: delivery.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
        timestamp: delivery.createdAt,
        description: "Delivery assigned to driver",
        metadata: {
          driver: this.getDriverName(delivery.employee),
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
            driver: this.getDriverName(delivery.employee),
            photos: delivery.deliveryPhotos,
          },
        });
      }
    });
  }

  private addNotificationEvents(timeline: any[], notifications: any[]): void {
    notifications?.forEach((notif: any) => {
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
  }

  private addPickupTimelineEvents(timeline: any[], pickUpJobs: any[]): void {
    if (pickUpJobs?.[0]) {
      const pickup = pickUpJobs[0];
      const driverName = this.getDriverName(pickup.employee);

      timeline.push({
        event: "Pickup Assigned",
        timestamp: pickup.createdAt,
        status: "COMPLETED",
        description: `Assigned to driver: ${driverName}`,
      });
    }
  }

  private addWorkProcessTimelineEvents(
    timeline: any[],
    orderWorkProcess: any[],
  ): void {
    orderWorkProcess?.forEach((wp: any) => {
      const workerName = this.getWorkerName(wp.employee);

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
  }

  private addDeliveryTimelineEvents(
    timeline: any[],
    deliveryJobs: any[],
  ): void {
    if (deliveryJobs?.[0]) {
      const delivery = deliveryJobs[0];
      const driverName = this.getDriverName(delivery.employee);

      timeline.push({
        event: "Delivery Assigned",
        timestamp: delivery.createdAt,
        status: delivery.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
        description: `Assigned to driver: ${driverName}`,
      });
    }
  }

  private sortTimelineByTimestamp(timeline: any[]): any[] {
    return timeline.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  private transformPaymentInfo(order: any): any {
    const isPaymentRequired = order.paymentStatus === "WAITING_PAYMENT";
    const isPaid = order.paymentStatus === "PAID";
    const hasXenditIntegration = !!order.xenditId;

    return {
      status: order.paymentStatus,
      totalAmount: order.totalPrice || 0,
      paidAt: order.paidAt,

      breakdown: {
        itemsTotal: (order.totalPrice || 0) - (order.totalDeliveryFee || 0),
        deliveryFee: order.totalDeliveryFee || 0,
        grandTotal: order.totalPrice || 0,
      },

      xendit: hasXenditIntegration
        ? {
            xenditId: order.xenditId,
            invoiceUrl: order.invoiceUrl,
            successRedirectUrl: order.successRedirectUrl,
            expiryDate: order.xenditExpiryDate,
            xenditStatus: order.xenditPaymentStatus,
            isExpired: order.xenditExpiryDate
              ? new Date() > new Date(order.xenditExpiryDate)
              : false,
          }
        : null,

      actions: {
        canPay:
          isPaymentRequired &&
          hasXenditIntegration &&
          !this.isXenditExpired(order.xenditExpiryDate),
        canRefund: isPaid && order.paidAt,
        canGenerateNewInvoice:
          isPaymentRequired && this.isXenditExpired(order.xenditExpiryDate),
      },

      statusInfo: {
        isPaid,
        isWaitingPayment: isPaymentRequired,
        isOverdue: this.isPaymentOverdue(order),
        paymentMethod: this.detectPaymentMethod(order),
        timeRemaining: this.calculateTimeRemaining(order.xenditExpiryDate),
      },
    };
  }

  private isXenditExpired(expiryDate: Date | null): boolean {
    if (!expiryDate) return false;
    return new Date() > new Date(expiryDate);
  }

  private isPaymentOverdue(order: any): boolean {
    if (order.paymentStatus !== "WAITING_PAYMENT") return false;
    if (!order.xenditExpiryDate) return false;
    return new Date() > new Date(order.xenditExpiryDate);
  }

  private detectPaymentMethod(order: any): string | null {
    if (order.paymentStatus === "PAID") {
      if (order.xenditPaymentStatus) {
        return this.parseXenditPaymentMethod(order.xenditPaymentStatus);
      }
      return "PAID";
    }
    return null;
  }

  private parseXenditPaymentMethod(xenditStatus: string): string {
    const status = xenditStatus.toLowerCase();

    if (status.includes("bank_transfer")) return "BANK_TRANSFER";
    if (status.includes("ewallet")) return "E_WALLET";
    if (status.includes("credit_card")) return "CREDIT_CARD";
    if (status.includes("qris")) return "QRIS";
    if (status.includes("virtual_account")) return "VIRTUAL_ACCOUNT";
    if (status.includes("retail_outlet")) return "RETAIL_OUTLET";

    return "ONLINE_PAYMENT";
  }

  private calculateTimeRemaining(expiryDate: Date | null): string | null {
    if (!expiryDate) return null;

    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffMs = expiry.getTime() - now.getTime();

    if (diffMs <= 0) return "EXPIRED";

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `${days}d ${hours}h remaining`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
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

  createPickupAndOrder = async (userId: number, body: CreatePickupOrderDTO) => {
    const { addressId, scheduledPickupTime } = body;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ApiError("Invalid user id", 404);
    }

    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new ApiError("Invalid address id", 404);
    }

    const outlets = await this.prisma.outlet.findMany();

    if (!outlets.length) {
      throw new ApiError("No outlet available", 500);
    }

    const closestOutlet = outlets.reduce((closest, current) => {
      const dist = haversine(
        address.latitude,
        address.longitude,
        current.latitude,
        current.longitude,
      );
      const closestDist = haversine(
        address.latitude,
        address.longitude,
        closest.latitude,
        closest.longitude,
      );
      return dist < closestDist ? current : closest;
    });

    const distanceKm = haversine(
      address.latitude,
      address.longitude,
      closestOutlet.latitude,
      closestOutlet.longitude
    );

    let totalDeliveryFee = 0;
    if (distanceKm <= 1) {
      totalDeliveryFee = closestOutlet.deliveryBaseFee;
    } else {
      totalDeliveryFee =
        closestOutlet.deliveryBaseFee +
        (distanceKm - 1) * closestOutlet.deliveryPerKm;
    }

    const orderNumber = `BF-${Date.now()}`;

    const newOrder = await this.prisma.order.create({
      data: {
        userId,
        outletId: closestOutlet.id,
        orderNumber,
        addressLine: address.addressLine,
        district: address.district,
        city: address.city,
        province: address.province,
        postalCode: address.postalCode,
        latitude: address.latitude,
        longitude: address.longitude,
        scheduledPickupTime: new Date(scheduledPickupTime),
        totalDeliveryFee
      },
    });

    const newPickup = await this.prisma.pickUpJob.create({
      data: {
        orderId: newOrder.uuid,
        pickUpScheduleOutlet: scheduledPickupTime,
      },
    });

    return { newOrder, newPickup };
  };

  getOrdersByUser = async (userId: number, page = 1, limit = 10) => {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ApiError("Invalid user id", 404);
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      }),
      this.prisma.order.count({
        where: { userId },
      }),
    ]);

    return {
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  };

  getDetailOrder = async (userId: number, uuid: string) => {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ApiError("Invalid user id", 404);
    }

    const order = await this.prisma.order.findUnique({
      where: { uuid },
    });

    if (!order) {
      throw new ApiError("Order not found", 400);
    }
    if (order.userId !== userId) {
      throw new ApiError("Unauthorised", 400);
    }

    return order;
  };

  confirmOrder = async (userId: number, uuid: string) => {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ApiError("Invalid user id", 404);
    }

    const order = await this.prisma.order.findUnique({
      where: { uuid },
    });

    if (!order) {
      throw new ApiError("Order not found", 400);
    }

    if (order.userId !== userId) {
      throw new ApiError("Unauthorised", 400);
    }

    const updatedOrder = await this.prisma.order.update({
      where: { uuid },
      data: { 
        orderStatus: "COMPLETED"
      }
    })

    return updatedOrder;
  };
}
