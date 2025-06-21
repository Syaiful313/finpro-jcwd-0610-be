import { OrderStatus, WorkerTypes } from "@prisma/client";
import { injectable } from "tsyringe";
import {
  CurrentWorkerInfo,
  CustomerInfo,
  DeliveryCalculationInfo,
  DeliveryInfo,
  DetailedCustomerInfo,
  ExportableOrder,
  OrderAddress,
  OrderDetailView,
  OrderItemInfo,
  OrderListItem,
  OrderSchedule,
  PaymentInfo,
  PendingOrderItem,
  PickupInfo,
  PricingBreakdown,
  ProcessHistoryItem,
  SimpleTimelineEvent,
  TimelineEvent,
  TrackingDelivery,
  TrackingInfo,
  TrackingPickup,
  WorkProcessInfo,
  WorkProcessProgress,
} from "./order.types";

@injectable()
export class OrderTransformerService {
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

  private static readonly TIMELINE_ICONS = {
    ORDER: "📝",
    PICKUP: "🚚",
    WASHING: "🧼",
    IRONING: "👔",
    PACKING: "📦",
    DELIVERY: "🚛",
    COMPLETED: "✅",
  } as const;

  transformOrdersList(orders: any[]): OrderListItem[] {
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

  transformPendingOrdersList(orders: any[]): PendingOrderItem[] {
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

  transformOrderDetail(order: any): OrderDetailView {
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

  transformOrdersForExport(orders: OrderListItem[]): ExportableOrder[] {
    return orders.map((order) => ({
      orderNumber: order.orderNumber,
      customerName: order.customer.name,
      customerEmail: order.customer.email,
      outletName: order.outlet.outletName,
      status: order.orderStatus,
      totalWeight: order.totalWeight,
      totalPrice: order.totalPrice,
      paymentStatus: order.paymentStatus,
      currentWorker: order.tracking.currentWorker?.name || "N/A",
      currentStation: order.tracking.currentWorker?.station || "N/A",
      pickupDriver: order.tracking.pickup?.driver || "N/A",
      deliveryDriver: order.tracking.delivery?.driver || "N/A",
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));
  }

  private transformCustomerInfo(user: any): CustomerInfo {
    return {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
    };
  }

  private transformDetailedCustomerInfo(user: any): DetailedCustomerInfo {
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

  private transformOrderAddress(order: any): OrderAddress {
    return {
      fullAddress: order.addressLine,
      district: order.district,
      city: order.city,
      province: order.province,
      postalCode: order.postalCode,
    };
  }

  private transformOrderSchedule(order: any): OrderSchedule {
    return {
      scheduledPickupTime: order.scheduledPickupTime,
      actualPickupTime: order.actualPickupTime,
      scheduledDeliveryTime: order.scheduledDeliveryTime,
      actualDeliveryTime: order.actualDeliveryTime,
    };
  }

  private extractCustomerCoordinates(addresses: any[]) {
    return addresses.length > 0
      ? {
          latitude: addresses[0].latitude,
          longitude: addresses[0].longitude,
        }
      : null;
  }

  private transformWorkProcessInfo(
    workProcesses: any,
    orderStatus: OrderStatus,
  ): WorkProcessInfo {
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
  ): WorkProcessProgress {
    const progress = OrderTransformerService.WORK_STAGES.map((stage) => {
      const process = workProcesses.find(
        (wp) => wp.workerType === stage.status,
      );

      if (!process) {
        return {
          stage: stage.stage,
          label: stage.label,
          status: "PENDING" as const,
          startedAt: null,
          completedAt: null,
          worker: null,
        };
      }

      return {
        stage: stage.stage,
        label: stage.label,
        status: process.completedAt
          ? ("COMPLETED" as const)
          : ("IN_PROGRESS" as const),
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
    const totalStages = OrderTransformerService.WORK_STAGES.length;

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

  private categorizeWorkProcesses(orderWorkProcess: any[]) {
    return {
      current: orderWorkProcess.find((wp) => !wp.completedAt),
      completed: orderWorkProcess.filter((wp) => wp.completedAt),
      all: orderWorkProcess,
    };
  }

  private findCurrentWorkProcess(workProcesses?: any[]): any | null {
    return workProcesses?.find((wp) => !wp.completedAt) || null;
  }

  private getCompletedProcesses(workProcesses?: any[]): any[] {
    return workProcesses?.filter((wp) => wp.completedAt) || [];
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

  private transformPickupJobsInfo(pickUpJobs: any[]): PickupInfo {
    return {
      jobs: pickUpJobs.map((job: any) => ({
        id: job.id,
        status: job.status,
        driver: job.employee
          ? {
              id: job.employee.id,
              name: this.getDriverName(job.employee),
              phoneNumber: job.employee.user?.phoneNumber,
            }
          : null,
        photos: job.pickUpPhotos ? job.pickUpPhotos.split(",") : [],
        scheduledOutlet: job.pickUpScheduleOutlet,
        notes: job.notes,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
      latest: pickUpJobs.length > 0 ? pickUpJobs[pickUpJobs.length - 1] : null,
    };
  }

  private transformDeliveryInfo(
    order: any,
    deliveryInfo: DeliveryCalculationInfo | null,
  ): DeliveryInfo {
    return {
      info: deliveryInfo,
      totalWeight: order.totalWeight,
      jobs: order.deliveryJobs.map((job: any) => ({
        id: job.id,
        status: job.status,
        driver: job.employee
          ? {
              id: job.employee.id,
              name: this.getDriverName(job.employee),
              phoneNumber: job.employee.user?.phoneNumber,
            }
          : null,
        photos: job.deliveryPhotos ? job.deliveryPhotos.split(",") : [],
        notes: job.notes,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
    };
  }

  private calculateDetailedDeliveryInfo(
    order: any,
  ): DeliveryCalculationInfo | null {
    const primaryAddress =
      order.user.addresses.find((addr: any) => addr.isPrimary) ||
      order.user.addresses[0];

    if (!primaryAddress || !order.outlet) return null;

    try {
      const { DistanceCalculator } = require("../../utils/distance.calculator");

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

  private buildOrderTracking(
    order: any,
    currentWorkProcess: any,
    completedProcesses: any[],
  ): TrackingInfo {
    return {
      currentWorker: this.transformCurrentWorker(currentWorkProcess),
      processHistory: this.transformProcessHistory(completedProcesses),
      pickup: this.transformTrackingPickup(order.pickUpJobs?.[0]),
      delivery: this.transformTrackingDelivery(order.deliveryJobs?.[0]),
      timeline: this.generateOrderTimeline(order),
    };
  }

  private transformCurrentWorker(workProcess: any): CurrentWorkerInfo | null {
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

  private transformProcessHistory(
    completedProcesses: any[],
  ): ProcessHistoryItem[] {
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

  private transformTrackingPickup(pickupJob: any): TrackingPickup | null {
    if (!pickupJob) return null;

    return {
      id: pickupJob.id,
      driver: this.getDriverName(pickupJob.employee),
      status: pickupJob.status,
      assignedAt: pickupJob.createdAt,
      lastUpdate: pickupJob.updatedAt,
    };
  }

  private transformTrackingDelivery(deliveryJob: any): TrackingDelivery | null {
    if (!deliveryJob) return null;

    return {
      id: deliveryJob.id,
      driver: this.getDriverName(deliveryJob.employee),
      status: deliveryJob.status,
      assignedAt: deliveryJob.createdAt,
      lastUpdate: deliveryJob.updatedAt,
    };
  }

  generateDetailedTimeline(order: any): TimelineEvent[] {
    const timeline: TimelineEvent[] = [];

    this.addOrderCreatedEvent(timeline, order);
    this.addPickupEvents(timeline, order.pickUpJobs);
    this.addWorkProcessEvents(timeline, order.orderWorkProcess);
    this.addDeliveryEvents(timeline, order.deliveryJobs);
    this.addNotificationEvents(timeline, order.notifications);

    return this.sortTimelineByTimestamp(timeline);
  }

  generateOrderTimeline(order: any): SimpleTimelineEvent[] {
    const timeline: SimpleTimelineEvent[] = [];

    timeline.push({
      event: "Order Created",
      timestamp: order.createdAt,
      status: "COMPLETED",
      description: "Customer request pickup created",
    });

    this.addPickupTimelineEvents(timeline, order.pickUpJobs);
    this.addWorkProcessTimelineEvents(timeline, order.orderWorkProcess);
    this.addDeliveryTimelineEvents(timeline, order.deliveryJobs);

    return this.sortSimpleTimelineByTimestamp(timeline);
  }

  private addOrderCreatedEvent(timeline: TimelineEvent[], order: any): void {
    timeline.push({
      id: `order-created-${order.uuid}`,
      event: "Order Created",
      type: "ORDER",
      status: "COMPLETED",
      timestamp: order.createdAt,
      description: "Customer created pickup request",
      icon: OrderTransformerService.TIMELINE_ICONS.ORDER,
      metadata: {
        orderNumber: order.orderNumber,
        totalItems: order.orderItems?.length || 0,
      },
    });
  }

  private addPickupEvents(timeline: TimelineEvent[], pickUpJobs: any[]): void {
    pickUpJobs?.forEach((pickup: any) => {
      timeline.push({
        id: `pickup-assigned-${pickup.id}`,
        event: "Pickup Assigned",
        type: "PICKUP",
        status: "COMPLETED",
        timestamp: pickup.createdAt,
        description: `Pickup assigned to driver`,
        icon: OrderTransformerService.TIMELINE_ICONS.PICKUP,
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
          icon: OrderTransformerService.TIMELINE_ICONS.PICKUP,
          metadata: {
            driver: this.getDriverName(pickup.employee),
            scheduledOutlet: pickup.pickUpScheduleOutlet,
            photos: pickup.pickUpPhotos,
          },
        });
      }
    });
  }

  private addWorkProcessEvents(
    timeline: TimelineEvent[],
    orderWorkProcess: any[],
  ): void {
    orderWorkProcess?.forEach((wp: any) => {
      const workerName = this.getWorkerName(wp.employee);

      timeline.push({
        id: `work-started-${wp.id}`,
        event: `${this.getStationName(wp.workerType)} Started`,
        type: "WORK_PROCESS",
        status: wp.completedAt ? "COMPLETED" : "IN_PROGRESS",
        timestamp: wp.createdAt,
        description: `Work started at ${this.getStationName(wp.workerType)}`,
        icon: this.getStationIcon(wp.workerType),
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
          icon: OrderTransformerService.TIMELINE_ICONS.COMPLETED,
          metadata: {
            worker: workerName,
            duration: this.calculateDuration(wp.createdAt, wp.completedAt),
            notes: wp.notes,
          },
        });
      }
    });
  }

  private addDeliveryEvents(
    timeline: TimelineEvent[],
    deliveryJobs: any[],
  ): void {
    deliveryJobs?.forEach((delivery: any) => {
      timeline.push({
        id: `delivery-assigned-${delivery.id}`,
        event: "Delivery Assigned",
        type: "DELIVERY",
        status: delivery.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
        timestamp: delivery.createdAt,
        description: "Delivery assigned to driver",
        icon: OrderTransformerService.TIMELINE_ICONS.DELIVERY,
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
          icon: OrderTransformerService.TIMELINE_ICONS.COMPLETED,
          metadata: {
            driver: this.getDriverName(delivery.employee),
            photos: delivery.deliveryPhotos,
          },
        });
      }
    });
  }

  private addNotificationEvents(
    timeline: TimelineEvent[],
    notifications: any[],
  ): void {
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

  private addPickupTimelineEvents(
    timeline: SimpleTimelineEvent[],
    pickUpJobs: any[],
  ): void {
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
    timeline: SimpleTimelineEvent[],
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
    timeline: SimpleTimelineEvent[],
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

  private sortTimelineByTimestamp(timeline: TimelineEvent[]): TimelineEvent[] {
    return timeline.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  private sortSimpleTimelineByTimestamp(
    timeline: SimpleTimelineEvent[],
  ): SimpleTimelineEvent[] {
    return timeline.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  calculatePricingBreakdown(order: any): PricingBreakdown {
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

  private transformOrderItems(orderItems: any[]): OrderItemInfo[] {
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

  transformPaymentInfo(order: any): PaymentInfo {
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
        : undefined,
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

  private getStationName(workerType: WorkerTypes): string {
    return OrderTransformerService.STATION_NAMES[workerType];
  }

  private getWorkerName(employee: any): string {
    return employee?.user
      ? `${employee.user.firstName} ${employee.user.lastName}`
      : OrderTransformerService.DEFAULT_MESSAGES.WORKER_NOT_AVAILABLE;
  }

  private getDriverName(employee: any): string {
    return employee?.user
      ? `${employee.user.firstName} ${employee.user.lastName}`
      : OrderTransformerService.DEFAULT_MESSAGES.DRIVER_NOT_AVAILABLE;
  }

  private getStationIcon(workerType: string): string {
    const icons = {
      WASHING: OrderTransformerService.TIMELINE_ICONS.WASHING,
      IRONING: OrderTransformerService.TIMELINE_ICONS.IRONING,
      PACKING: OrderTransformerService.TIMELINE_ICONS.PACKING,
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
}
