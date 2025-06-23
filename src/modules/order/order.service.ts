import { DriverTaskStatus, OrderStatus, Prisma, Role } from "@prisma/client";
import { customAlphabet } from "nanoid";
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
import { OrderTransformerService } from "./order-transformer.service";
import { CurrentUser } from "./order.types";

@injectable()
export class OrderService {
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
    private readonly transformerService: OrderTransformerService,
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

    const transformedOrders =
      this.transformerService.transformOrdersList(orders);

    return {
      data: transformedOrders,
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

    return this.transformerService.transformOrderDetail(order);
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

    const transformedOrders =
      this.transformerService.transformPendingOrdersList(orders);

    return {
      data: transformedOrders,
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

  private validateDateInputs = (startDate?: string, endDate?: string): void => {
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
  };

  private validateNumericInputs = (
    employeeId?: string,
    outletId?: string,
  ): void => {
    if (
      employeeId &&
      (isNaN(parseInt(employeeId)) || parseInt(employeeId) <= 0)
    ) {
      throw new ApiError(OrderService.ERROR_MESSAGES.INVALID_EMPLOYEE_ID, 400);
    }
    if (outletId && (isNaN(parseInt(outletId)) || parseInt(outletId) <= 0)) {
      throw new ApiError(OrderService.ERROR_MESSAGES.INVALID_OUTLET_ID, 400);
    }
  };

  private validateOrderDetailAccess = (currentUser: CurrentUser): void => {
    if (
      !([Role.ADMIN, Role.OUTLET_ADMIN] as Role[]).includes(currentUser.role)
    ) {
      throw new ApiError(
        "Permission tidak cukup untuk melihat detail order",
        403,
      );
    }
  };

  private validateOutletAdminRole = (currentUser: CurrentUser): void => {
    if (currentUser.role !== Role.OUTLET_ADMIN) {
      throw new ApiError(OrderService.ERROR_MESSAGES.OUTLET_ADMIN_ONLY, 403);
    }
  };

  private validateOrderWeight = (totalWeight: number): void => {
    if (!totalWeight || totalWeight <= 0) {
      throw new ApiError("Total berat harus diisi dan lebih dari 0", 400);
    }
  };

  private validateOutletAdminOutletAccess = async (
    userId: number,
    outletId: string,
  ): Promise<void> => {
    const userOutlet = await this.getUserOutlet(userId);
    if (parseInt(outletId) !== userOutlet.outletId) {
      throw new ApiError("Outlet admin hanya bisa filter outlet sendiri", 403);
    }
  };

  private validateOrderForProcessing = async (
    orderId: string,
    userOutletId: number,
  ) => {
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
  };

  private validateOutlet = async (outletId: number): Promise<void> => {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: outletId },
      select: { id: true, isActive: true },
    });

    if (!outlet) {
      throw new ApiError(OrderService.ERROR_MESSAGES.OUTLET_NOT_FOUND, 404);
    }
  };

  private validateEmployee = async (employeeId: number): Promise<void> => {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });

    if (!employee) {
      throw new ApiError(OrderService.ERROR_MESSAGES.EMPLOYEE_NOT_FOUND, 404);
    }
  };

  private buildOrdersWhereClause = async (
    query: GetOrdersDTO,
    currentUser: CurrentUser,
  ): Promise<Prisma.OrderWhereInput> => {
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
  };

  private buildOrderDetailWhereClause = async (
    orderId: string,
    currentUser: CurrentUser,
  ): Promise<Prisma.OrderWhereInput> => {
    const whereClause: Prisma.OrderWhereInput = {
      uuid: orderId,
      user: { deletedAt: null },
    };

    if (currentUser.role === Role.OUTLET_ADMIN) {
      const userOutlet = await this.getUserOutlet(currentUser.id);
      whereClause.outletId = userOutlet.outletId;
    }

    return whereClause;
  };

  private buildPendingOrdersWhereClause = (
    query: GetPendingOrdersDTO,
    outletId: number,
  ): Prisma.OrderWhereInput => {
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
  };

  private applyRoleBasedFiltering = async (
    where: Prisma.OrderWhereInput,
    currentUser: CurrentUser,
    outletId?: string,
  ): Promise<void> => {
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
  };

  private buildSearchConditions = (search: string): Prisma.OrderWhereInput => {
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
  };

  private buildCustomerNameFilter = (
    customerName: string,
  ): Prisma.OrderWhereInput => {
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
  };

  private applyEmployeeFilter = (
    where: Prisma.OrderWhereInput,
    employeeId: string,
  ): void => {
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
  };

  private buildDateFilter = (startDate?: string, endDate?: string): any => {
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate + "T00:00:00.000Z");
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate + "T23:59:59.999Z");
    }
    return dateFilter;
  };

  private getOrdersSelectClause = () => {
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
  };

  private getPendingOrdersSelectClause = () => {
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
  };

  private fetchOrderDetail = async (whereClause: Prisma.OrderWhereInput) => {
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
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  };

  private calculateOrderDeliveryFee = async (
    existingOrder: any,
  ): Promise<number> => {
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
  };

  private getCustomerCoordinates = async (
    userId: number,
  ): Promise<{ latitude: number; longitude: number } | null> => {
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
  };

  private processOrderItems = async (
    orderItems: any[],
  ): Promise<{ processedItems: any[]; calculatedTotalPrice: number }> => {
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
  };

  private validateLaundryItems = async (
    laundryItemIds: number[],
  ): Promise<any[]> => {
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
  };

  private calculateItemPricing = (
    orderItem: any,
    laundryItem: any,
  ): { quantity: number; weight: number; itemPrice: number } => {
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
  };

  private executeOrderProcessing = async (params: {
    orderId: string;
    totalWeight: number;
    finalTotalPrice: number;
    totalDeliveryFee: number;
    processedItems: any[];
    existingOrder: any;
  }): Promise<any> => {
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

      return updatedOrder;
    });
  };

  private buildProcessOrderResponse = (
    result: any,
    calculatedTotalPrice: number,
    totalDeliveryFee: number,
  ): any => {
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

  private getUserOutlet = async (
    userId: number,
  ): Promise<{ outletId: number }> => {
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
      select: { outletId: true },
    });

    if (!employee) {
      throw new ApiError("Data employee tidak ditemukan", 400);
    }

    return employee;
  };

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
      closestOutlet.longitude,
    );

    let totalDeliveryFee = 0;
    if (distanceKm <= 1) {
      totalDeliveryFee = closestOutlet.deliveryBaseFee;
    } else {
      totalDeliveryFee =
        closestOutlet.deliveryBaseFee +
        (distanceKm - 1) * closestOutlet.deliveryPerKm;
    }

    const nanoid = customAlphabet("0123456789", 6);
    const orderNumber = `BF-${nanoid(6)}`;

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
        totalDeliveryFee,
      },
    });

    const newPickup = await this.prisma.pickUpJob.create({
      data: {
        orderId: newOrder.uuid,
        pickUpScheduleOutlet: scheduledPickupTime,
      },
    });

    await this.prisma.notification.create({
      data: {
        message: `Request pickup for order ${newOrder.orderNumber}`,
        orderStatus: "WAITING_FOR_PICKUP",
        notifType: "NEW_PICKUP_REQUEST"
      }
    })

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
        orderStatus: "COMPLETED",
      },
    });

    return updatedOrder;
  };
}
