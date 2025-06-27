import { WorkerTypes, OrderStatus, BypassStatus } from "@prisma/client";

export class BypassUtils {
  static getNextOrderStatus(workerType: WorkerTypes): OrderStatus {
    switch (workerType) {
      case WorkerTypes.WASHING:
        return OrderStatus.BEING_IRONED;
      case WorkerTypes.IRONING:
        return OrderStatus.BEING_PACKED;
      case WorkerTypes.PACKING:
        return OrderStatus.WAITING_PAYMENT;
      default:
        throw new Error(`Invalid worker type: ${workerType}`);
    }
  }

  static getCurrentOrderStatus(workerType: WorkerTypes): OrderStatus {
    switch (workerType) {
      case WorkerTypes.WASHING:
        return OrderStatus.BEING_WASHED;
      case WorkerTypes.IRONING:
        return OrderStatus.BEING_IRONED;
      case WorkerTypes.PACKING:
        return OrderStatus.BEING_PACKED;
      default:
        throw new Error(`Invalid worker type: ${workerType}`);
    }
  }

  static canProcessBypassRequest(status: BypassStatus): boolean {
    return status === BypassStatus.PENDING;
  }

  static formatBypassRequestForDisplay(bypassRequest: any) {
    return {
      id: bypassRequest.id,
      reason: bypassRequest.reason,
      adminNote: bypassRequest.adminNote,
      status: bypassRequest.bypassStatus,
      createdAt: bypassRequest.createdAt,
      updatedAt: bypassRequest.updatedAt,
      outlet: {
        name: bypassRequest.approvedByEmployee?.outlet?.outletName,
        address: bypassRequest.approvedByEmployee?.outlet?.address,
      },
      requestedBy: {
        name: `${bypassRequest.orderWorkProcesses[0]?.employee?.user?.firstName} ${bypassRequest.orderWorkProcesses[0]?.employee?.user?.lastName}`,
        workerType: bypassRequest.orderWorkProcesses[0]?.workerType,
      },
      order: {
        uuid: bypassRequest.orderWorkProcesses[0]?.order?.uuid,
        orderNumber: bypassRequest.orderWorkProcesses[0]?.order?.orderNumber,
        status: bypassRequest.orderWorkProcesses[0]?.order?.orderStatus,
        customer: {
          name: `${bypassRequest.orderWorkProcesses[0]?.order?.user?.firstName} ${bypassRequest.orderWorkProcesses[0]?.order?.user?.lastName}`,
          email: bypassRequest.orderWorkProcesses[0]?.order?.user?.email,
        },
      },
    };
  }

  static validateAdminNote(note: string): boolean {
    return Boolean(note && note.trim().length > 0 && note.length <= 500);
  }

  static generateBypassSummary(
    workerType: WorkerTypes,
    orderNumber: string,
    reason: string,
  ): string {
    const stationName = workerType.toLowerCase().replace("_", " ");
    return `${stationName} station bypass request for order ${orderNumber}: ${reason}`;
  }
}