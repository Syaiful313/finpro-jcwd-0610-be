import {
  DriverTaskStatus,
  NotifType,
  OrderStatus,
  PaymentStatus,
  PickUpJob,
  DeliveryJob,
  Prisma,
  Role,
} from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { AttendanceService } from "../attendance/attendance.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CompleteDeliveryDto,
  CompletePickupDto,
} from "./dto/complete-request.dto";
import { GetDriverDTO } from "./dto/driver.dto";

type CombinedJob = (PickUpJob | DeliveryJob) & {
  jobType?: "pickup" | "delivery";
  photos?: string | null;
};

@injectable()
export class DriverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly fileService: CloudinaryService,
    private readonly attendanceService: AttendanceService,
  ) {}

  public isDriverBusy = async (employeeId: number) => {
    const activeJobs = await this.prisma.employee.findFirst({
      where: { id: employeeId, user: { role: Role.DRIVER } },
      select: {
        _count: {
          select: {
            pickUpJobs: { where: { status: DriverTaskStatus.IN_PROGRESS } },
            deliveryJobs: { where: { status: DriverTaskStatus.IN_PROGRESS } },
          },
        },
      },
    });

    if (!activeJobs) throw new ApiError("Driver not found", 404);
    return activeJobs._count.pickUpJobs + activeJobs._count.deliveryJobs > 0;
  };

  public hasReachedOrderLimit = async (employeeId: number) => {
    const statusFilter = [
      DriverTaskStatus.ASSIGNED,
      DriverTaskStatus.IN_PROGRESS,
    ];
    const claimedJobs = await this.prisma.employee.findFirst({
      where: { id: employeeId, user: { role: Role.DRIVER } },
      select: {
        _count: {
          select: {
            pickUpJobs: { where: { status: { in: statusFilter } } },
            deliveryJobs: { where: { status: { in: statusFilter } } },
          },
        },
      },
    });

    if (!claimedJobs) throw new ApiError("Driver not found", 404);
    return claimedJobs._count.pickUpJobs + claimedJobs._count.deliveryJobs >= 5;
  };

  public getAvailableRequests = async (
    authUserId: number,
    dto: GetDriverDTO,
    requestType?: "pickup" | "delivery" | "all",
  ) => {
    const employee =
      await this.attendanceService.ensureEmployeeIsClockedIn(authUserId);
    if (employee.user.role !== "DRIVER") {
      throw new ApiError("User is not a driver", 403);
    }
    const hasReachedLimit = await this.hasReachedOrderLimit(employee.id);
    const {
      page,
      take,
      sortBy = "createdAt",
      sortOrder = "desc",
      all,
      search,
    } = dto;
    const searchFilter = this._createJobSearchFilter(search);

    let availableJobs: CombinedJob[] = [];
    let totalCount = 0;

    if (requestType === "pickup" || requestType === "all") {
      const where: Prisma.PickUpJobWhereInput = {
        employeeId: null,
        status: DriverTaskStatus.PENDING,
        order: { outletId: employee.outletId, ...searchFilter },
      };

      const findManyArgs: Prisma.PickUpJobFindManyArgs = {
        where,
        include: this._getJobOrderInclude(),
        orderBy: { [sortBy]: sortOrder },
      };
      if (requestType === "pickup" && !all) {
        findManyArgs.skip = (page - 1) * take;
        findManyArgs.take = take;
      }

      const [pickupJobs, pickupCount] = await this.prisma.$transaction([
        this.prisma.pickUpJob.findMany(findManyArgs),
        this.prisma.pickUpJob.count({ where }),
      ]);
      availableJobs.push(
        ...pickupJobs.map((job) => ({
          ...job,
          jobType: "pickup" as const,
          canClaim: !hasReachedLimit,
        })),
      );
      if (requestType === "pickup") totalCount = pickupCount;
    }

    if (requestType === "delivery" || requestType === "all") {
      const where: Prisma.DeliveryJobWhereInput = {
        employeeId: null,
        status: DriverTaskStatus.PENDING,
        order: {
          outletId: employee.outletId,
          paymentStatus: PaymentStatus.PAID,
          ...searchFilter,
        },
      };

      const findManyArgs: Prisma.DeliveryJobFindManyArgs = {
        where,
        include: this._getJobOrderInclude(),
        orderBy: { [sortBy]: sortOrder },
      };
      if (requestType === "delivery" && !all) {
        findManyArgs.skip = (page - 1) * take;
        findManyArgs.take = take;
      }

      const [deliveryJobs, deliveryCount] = await this.prisma.$transaction([
        this.prisma.deliveryJob.findMany(findManyArgs),
        this.prisma.deliveryJob.count({ where }),
      ]);
      availableJobs.push(
        ...deliveryJobs.map((job) => ({
          ...job,
          jobType: "delivery" as const,
          canClaim: !hasReachedLimit,
        })),
      );
      if (requestType === "delivery") totalCount = deliveryCount;
    }

    if (requestType === "all") {
      availableJobs.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
      });
      totalCount = availableJobs.length;
      if (!all) {
        const startIndex = (page - 1) * take;
        availableJobs = availableJobs.slice(startIndex, startIndex + take);
      }
    }

    return {
      data: availableJobs,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? totalCount : take,
        count: totalCount,
      }),
    };
  };

  public getDriverJobs = async (authUserId: number, dto: GetDriverDTO) => {
    const {
      page = 1,
      take = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      all,
      status,
      jobType,
      dateFrom,
      dateTo,
    } = dto;

    const employee =
      status !== "completed"
        ? await this.attendanceService.ensureEmployeeIsClockedIn(authUserId)
        : await this._getAndValidateDriver(authUserId, false);

    const whereClause = this._createDriverJobWhereClause(
      employee.id,
      status,
      dateFrom,
      dateTo,
    );

    let allJobs: CombinedJob[] = [];
    let totalCount = 0;

    if (jobType === "pickup") {
      const [jobs, count] = await this._fetchJobs("pickUpJob", whereClause, {
        ...dto,
      });
      allJobs = jobs.map((job) => ({
        ...job,
        jobType: "pickup" as const,
        photos: job.pickUpPhotos,
      }));
      totalCount = count;
    } else if (jobType === "delivery") {
      const [jobs, count] = await this._fetchJobs("deliveryJob", whereClause, {
        ...dto,
      });
      allJobs = jobs.map((job) => ({
        ...job,
        jobType: "delivery" as const,
        photos: job.deliveryPhotos,
      }));
      totalCount = count;
    } else {
      const [pickupJobs] = await this._fetchJobs("pickUpJob", whereClause, {
        ...dto,
        all: true,
      });
      const [deliveryJobs] = await this._fetchJobs("deliveryJob", whereClause, {
        ...dto,
        all: true,
      });

      allJobs = [
        ...pickupJobs.map((job) => ({
          ...job,
          jobType: "pickup" as const,
          photos: job.pickUpPhotos,
        })),
        ...deliveryJobs.map((job) => ({
          ...job,
          jobType: "delivery" as const,
          photos: job.deliveryPhotos,
        })),
      ];

      allJobs.sort((a: any, b: any) => {
        const dateA = new Date(a.updatedAt).getTime();
        const dateB = new Date(b.updatedAt).getTime();
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
      });

      totalCount = allJobs.length;

      if (!all) {
        const skip = (page - 1) * take;
        allJobs = allJobs.slice(skip, skip + take);
      }
    }

    return {
      data: allJobs,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? totalCount : take,
        count: totalCount,
      }),
    };
  };

  public getOrderDetail = async (authUserId: number, orderId: string) => {
    await this._getAndValidateDriver(authUserId, false);

    const order = await this.prisma.order.findUnique({
      where: { uuid: orderId },
      include: {
        pickUpJobs: {
          include: {
            order: { include: { user: true } },
          },
        },
        deliveryJobs: {
          include: {
            order: { include: { user: true } },
          },
        },
      },
    });

    if (!order) throw new ApiError("Order not found", 404);

    const jobStatusFilter: DriverTaskStatus[] = [
      DriverTaskStatus.ASSIGNED,
      DriverTaskStatus.IN_PROGRESS,
      DriverTaskStatus.COMPLETED,
    ];
    const activePickup = order.pickUpJobs?.find((job) =>
      jobStatusFilter.includes(job.status),
    );
    const activeDelivery = order.deliveryJobs?.find((job) =>
      jobStatusFilter.includes(job.status),
    );

    const activeJob = activeDelivery
      ? { type: "delivery" as const, job: activeDelivery }
      : activePickup
        ? { type: "pickup" as const, job: activePickup }
        : null;

    if (!activeJob) {
      return null;
    }

    if (activeJob.job.status !== DriverTaskStatus.COMPLETED) {
      await this.attendanceService.ensureEmployeeIsClockedIn(authUserId);
    }

    return activeJob;
  };

  public claimPickUpRequest = (authUserId: number, pickUpJobId: number) =>
    this._claimJob(authUserId, pickUpJobId, "pickup");
  public claimDeliveryRequest = (authUserId: number, deliveryJobId: number) =>
    this._claimJob(authUserId, deliveryJobId, "delivery");

  public startPickUp = (authUserId: number, pickupJobId: number) =>
    this._startJob(authUserId, pickupJobId, "pickup");
  public startDelivery = (authUserId: number, deliveryJobId: number) =>
    this._startJob(authUserId, deliveryJobId, "delivery");

  public completePickUp = (
    authUserId: number,
    pickupJobId: number,
    body: Partial<CompletePickupDto>,
    pickUpPhotos: Express.Multer.File,
  ) => this._completeJob(authUserId, pickupJobId, "pickup", body, pickUpPhotos);
  public completeDelivery = (
    authUserId: number,
    deliveryJobId: number,
    body: Partial<CompleteDeliveryDto>,
    deliveryPhotos: Express.Multer.File,
  ) =>
    this._completeJob(
      authUserId,
      deliveryJobId,
      "delivery",
      body,
      deliveryPhotos,
    );

  private async _getAndValidateDriver(
    authUserId: number,
    ensureClockedIn = true,
  ) {
    const employee = ensureClockedIn
      ? await this.attendanceService.ensureEmployeeIsClockedIn(authUserId)
      : await this.prisma.employee.findFirst({
          where: { userId: authUserId },
          include: { user: true },
        });

    if (!employee || employee.user.role !== Role.DRIVER) {
      throw new ApiError("Driver not found or user is not a driver", 404);
    }
    return employee;
  }

  private async _getDriverStatus(employeeId: number) {
    const [isBusy, hasReachedLimit] = await Promise.all([
      this.isDriverBusy(employeeId),
      this.hasReachedOrderLimit(employeeId),
    ]);
    return { isBusy, hasReachedLimit };
  }

  private _getJobOrderInclude() {
    return {
      order: {
        include: {
          user: {
            select: { firstName: true, lastName: true, phoneNumber: true },
          },
          outlet: { select: { outletName: true } },
        },
      },
    };
  }

  private _createJobSearchFilter(search?: string) {
    if (!search) return {};
    return {
      OR: [
        { orderNumber: { contains: search, mode: "insensitive" as const } },
        {
          user: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
            ],
          },
        },
      ],
    };
  }

  private _createDriverJobWhereClause(
    employeeId: number,
    status?: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    let statusFilter: DriverTaskStatus[] = [];
    if (status === "active")
      statusFilter = [DriverTaskStatus.ASSIGNED, DriverTaskStatus.IN_PROGRESS];
    else if (status === "completed")
      statusFilter = [DriverTaskStatus.COMPLETED];

    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = new Date(`${dateFrom}T00:00:00.000Z`);
    if (dateTo) dateFilter.lte = new Date(`${dateTo}T23:59:59.999Z`);

    return {
      employeeId,
      ...(statusFilter.length > 0 && { status: { in: statusFilter } }),
      ...(Object.keys(dateFilter).length > 0 && { updatedAt: dateFilter }),
    };
  }

  private async _fetchJobs(
    model: "pickUpJob" | "deliveryJob",
    whereClause: any,
    dto: GetDriverDTO,
  ): Promise<[any[], number]> {
    const { page, take, sortBy, sortOrder, all } = dto;
    const orderBy =
      sortBy && sortOrder ? { [sortBy]: sortOrder } : { createdAt: "desc" };

    const findManyArgs: any = {
      where: whereClause,
      include: this._getJobOrderInclude(),
      orderBy,
    };
    if (!all && page && take) {
      findManyArgs.skip = (page - 1) * take;
      findManyArgs.take = take;
    }

    return this.prisma.$transaction([
      (this.prisma[model] as any).findMany(findManyArgs),
      (this.prisma[model] as any).count({ where: whereClause }),
    ]);
  }

  private async _claimJob(
    authUserId: number,
    jobId: number,
    type: "pickup" | "delivery",
  ) {
    const employee = await this._getAndValidateDriver(authUserId);
    const { isBusy, hasReachedLimit } = await this._getDriverStatus(
      employee.id,
    );

    if (isBusy)
      throw new ApiError("Driver is currently busy with another order", 400);
    if (hasReachedLimit)
      throw new ApiError(
        "Driver has reached maximum order limit (5 orders)",
        400,
      );

    const modelName = type === "pickup" ? "pickUpJob" : "deliveryJob";
    const job = await (this.prisma[modelName] as any).findUnique({
      where: { id: jobId },
      include: { order: true },
    });

    if (!job) throw new ApiError(`${type} job not found`, 404);
    if (job.employeeId) throw new ApiError("Job already claimed", 400);
    if (job.status !== DriverTaskStatus.PENDING)
      throw new ApiError("Job not available", 400);
    if (job.order.outletId !== employee.outletId)
      throw new ApiError("Job not from your outlet", 400);
    if (type === "delivery" && job.order.paymentStatus !== PaymentStatus.PAID)
      throw new ApiError("Order not paid", 400);

    const notificationMessage =
      type === "pickup"
        ? `Good news! Driver ${employee.user.firstName} ${employee.user.lastName} has been assigned to pick up your laundry for Order #${job.order.orderNumber}. You'll be notified when they're on the way!`
        : `Excellent! Your clean laundry is ready for delivery! Driver ${employee.user.firstName} ${employee.user.lastName} has been assigned to deliver Order #${job.order.orderNumber}. You'll be notified when they're on the way!`;

    return this.prisma.$transaction(async (tx) => {
      const updatedJob = await (tx[modelName] as any).update({
        where: { id: jobId },
        data: { employeeId: employee.id, status: DriverTaskStatus.ASSIGNED },
      });
      await tx.notification.create({
        data: {
          orderId: job.order.uuid,
          message: notificationMessage,
          notifType: NotifType.NEW_PICKUP_REQUEST,
          orderStatus: job.order.orderStatus,
          role: Role.CUSTOMER,
        },
      });
      return updatedJob;
    });
  }

  private async _startJob(
    authUserId: number,
    jobId: number,
    type: "pickup" | "delivery",
  ) {
    const employee = await this._getAndValidateDriver(authUserId);
    if (await this.isDriverBusy(employee.id))
      throw new ApiError("Driver is busy with another task", 400);

    const modelName = type === "pickup" ? "pickUpJob" : "deliveryJob";
    const job = await (this.prisma[modelName] as any).findFirst({
      where: {
        id: jobId,
        employeeId: employee.id,
        status: DriverTaskStatus.ASSIGNED,
      },
      include: { order: true },
    });

    if (!job) throw new ApiError("Job not found or not assigned to you", 404);

    const orderStatus =
      type === "pickup"
        ? OrderStatus.DRIVER_ON_THE_WAY_TO_CUSTOMER
        : OrderStatus.BEING_DELIVERED_TO_CUSTOMER;
    const notifType =
      type === "pickup" ? NotifType.PICKUP_STARTED : NotifType.DELIVERY_STARTED;

    const notificationMessages = {
      CUSTOMER:
        type === "pickup"
          ? `Your driver ${employee.user.firstName} ${employee.user.lastName} is on the way to pick up your laundry! Order #${job.order.orderNumber}`
          : `Great news! Your clean laundry is on the way! Driver ${employee.user.firstName} ${employee.user.lastName} is delivering Order #${job.order.orderNumber}`,
      OUTLET_ADMIN: `Driver ${employee.user.firstName} ${employee.user.lastName} has started ${type} for Order #${job.order.orderNumber}`,
    };

    return this.prisma.$transaction(async (tx) => {
      await (tx[modelName] as any).update({
        where: { id: jobId },
        data: { status: DriverTaskStatus.IN_PROGRESS },
      });
      await tx.order.update({
        where: { uuid: job.order.uuid },
        data: { orderStatus },
      });

      await tx.notification.createMany({
        data: [
          {
            orderId: job.order.uuid,
            message: notificationMessages.CUSTOMER,
            notifType,
            orderStatus,
            role: Role.CUSTOMER,
          },
          {
            orderId: job.order.uuid,
            message: notificationMessages.OUTLET_ADMIN,
            notifType,
            orderStatus,
            role: Role.OUTLET_ADMIN,
          },
        ],
      });

      return job;
    });
  }

  private async _completeJob(
    authUserId: number,
    jobId: number,
    type: "pickup" | "delivery",
    body: any,
    photo: Express.Multer.File,
  ) {
    const employee = await this._getAndValidateDriver(authUserId);

    const modelName = type === "pickup" ? "pickUpJob" : "deliveryJob";
    const job = await (this.prisma[modelName] as any).findFirst({
      where: {
        id: jobId,
        employeeId: employee.id,
        status: DriverTaskStatus.IN_PROGRESS,
      },
      include: { order: true },
    });

    if (!job)
      throw new ApiError(
        "Job not found or not in progress for this driver",
        404,
      );

    const { secure_url } = await this.fileService.upload(photo);

    const jobUpdateData = {
      status: DriverTaskStatus.COMPLETED,
      notes: body.notes,
      [type === "pickup" ? "pickUpPhotos" : "deliveryPhotos"]: secure_url,
    };

    const orderUpdateData =
      type === "pickup"
        ? {
            orderStatus: OrderStatus.ARRIVED_AT_OUTLET,
            actualPickupTime: new Date(),
          }
        : {
            orderStatus: OrderStatus.DELIVERED_TO_CUSTOMER,
            actualDeliveryTime: new Date(),
          };

    const notifType =
      type === "pickup"
        ? NotifType.PICKUP_COMPLETED
        : NotifType.DELIVERY_COMPLETED;

    const notificationMessages = {
      CUSTOMER:
        type === "pickup"
          ? `Your laundry has been picked up successfully! Order #${job.order.orderNumber} is now on the way to our outlet for processing.`
          : `Your laundry has been delivered successfully! Order #${job.order.orderNumber} has been completed.`,
      OUTLET_ADMIN: `${type.charAt(0).toUpperCase() + type.slice(1)} task completed for Order #${job.order.orderNumber}. Driver: ${employee.user.firstName} ${employee.user.lastName}${type === "pickup" ? " is heading to outlet." : ""}`,
    };

    return this.prisma.$transaction(async (tx) => {
      const updatedJob = await (tx[modelName] as any).update({
        where: { id: jobId },
        data: jobUpdateData,
      });
      await tx.order.update({
        where: { uuid: job.order.uuid },
        data: orderUpdateData,
      });

      await tx.notification.createMany({
        data: [
          {
            orderId: job.order.uuid,
            message: notificationMessages.CUSTOMER,
            notifType,
            orderStatus: orderUpdateData.orderStatus,
            role: Role.CUSTOMER,
          },
          {
            orderId: job.order.uuid,
            message: notificationMessages.OUTLET_ADMIN,
            notifType,
            orderStatus: orderUpdateData.orderStatus,
            role: Role.OUTLET_ADMIN,
          },
        ],
      });

      return updatedJob;
    });
  }
}
