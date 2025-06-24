export interface BypassRequestWithDetails {
  id: number;
  reason: string;
  adminNote: string | null;
  bypassStatus: string;
  createdAt: Date;
  updatedAt: Date;
  approvedByEmployee: {
    id: number;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
    outlet: {
      outletName: string;
      address?: string;
    };
  };
  orderWorkProcesses: Array<{
    id: number;
    workerType: string;
    notes: string | null;
    completedAt: Date | null;
    order: {
      uuid: string;
      orderNumber: string;
      orderStatus: string;
      user: {
        firstName: string;
        lastName: string;
        email: string;
      };
      orderItems?: Array<{
        id: number;
        quantity: number | null;
        weight: number | null;
        pricePerUnit: number;
        totalPrice: number;
        laundryItem: {
          name: string;
          category: string;
        };
        orderItemDetails: Array<{
          name: string;
          qty: number;
        }>;
      }>;
    };
    employee: {
      id: number;
      user: {
        firstName: string;
        lastName: string;
      };
    };
  }>;
}

export interface BypassRequestStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

export interface BypassRequestListResponse {
  data: BypassRequestWithDetails[];
  meta: {
    page: number;
    take: number;
    total: number;
    totalPages: number;
  };
}
