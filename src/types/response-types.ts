import {
  BypassStatus,
  DriverTaskStatus,
  OrderStatus,
  PaymentStatus,
  WorkerTypes,
} from "@prisma/client";

export interface OrderListResponse {
  success: boolean;
  message: string;
  data: OrderSummary[];
  meta: PaginationMeta;
}

export interface OrderSummary {
  uuid: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  totalWeight: number;
  totalPrice: number;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  customer: CustomerSummary;
  outlet: OutletSummary;
  tracking: OrderTracking;
}

export interface CustomerSummary {
  id: number;
  name: string;
  email: string;
}

export interface OutletSummary {
  id: number;
  outletName: string;
}

export interface OrderTracking {
  currentWorker: CurrentWorker | null;
  processHistory: ProcessHistory[];
  pickup: PickupInfo | null;
  delivery: DeliveryInfo | null;
  timeline: TimelineEvent[];
}

export interface CurrentWorker {
  id: number;
  name: string;
  workerType: WorkerTypes;
  station: string;
  startedAt: string;
  notes?: string;
  hasBypass: boolean;
}

export interface ProcessHistory {
  station: string;
  worker: string;
  startedAt: string;
  completedAt: string;
  duration: string;
  notes?: string;
  hasBypass: boolean;
}

export interface PickupInfo {
  id: number;
  driver: string;
  status: DriverTaskStatus;
  assignedAt: string;
  lastUpdate: string;
}

export interface DeliveryInfo {
  id: number;
  driver: string;
  status: DriverTaskStatus;
  assignedAt: string;
  lastUpdate: string;
}

export interface TimelineEvent {
  event: string;
  timestamp: string;
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
  description: string;
  worker?: string;
  notes?: string;
  hasBypass?: boolean;
}

export interface OrderDetailResponse {
  success: boolean;
  message: string;
  data: OrderDetail;
}

export interface OrderDetail extends OrderSummary {
  scheduledPickupTime?: string;
  actualPickupTime?: string;
  scheduledDeliveryTime?: string;
  actualDeliveryTime?: string;
  address: CustomerAddress;
  items: OrderItem[];
  workProcesses: WorkProcess[];
  pickupInfo: PickupJobDetail[];
  deliveryInfo: DeliveryJobDetail[];
}

export interface CustomerAddress {
  fullAddress: string;
  district: string;
  city: string;
  province: string;
  postalCode: string;
}

export interface OrderItem {
  id: number;
  name: string;
  category: string;
  quantity?: number;
  weight?: number;
  pricePerUnit: number;
  totalPrice: number;
  color?: string;
  brand?: string;
  materials?: string;
  pricingType: string;
  details: OrderItemDetail[];
}

export interface OrderItemDetail {
  id: number;
  name: string;
  qty: number;
}

export interface WorkProcess {
  id: number;
  workerType: WorkerTypes;
  worker: {
    id: number;
    name: string;
  };
  notes?: string;
  completedAt?: string;
  createdAt: string;
  bypass?: BypassInfo;
}

export interface BypassInfo {
  id: number;
  reason: string;
  adminNote?: string;
  bypassStatus: BypassStatus;
  createdAt: string;
}

export interface PickupJobDetail {
  id: number;
  status: DriverTaskStatus;
  driver: {
    id: number;
    name: string;
    phoneNumber?: string;
  };
  photos?: string;
  scheduledOutlet: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryJobDetail {
  id: number;
  status: DriverTaskStatus;
  driver: {
    id: number;
    name: string;
    phoneNumber?: string;
  };
  photos?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  take: number;
  count: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface OrderListQuery {
  page?: number;
  take?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
  status?: OrderStatus;
  outletId?: number;
  employeeId?: number;
  startDate?: string;
  endDate?: string;
}

export interface OrderExportResponse {
  success: boolean;
  message: string;
  data: OrderExportData[];
  meta: {
    total: number;
    exportedAt: string;
  };
}

export interface OrderExportData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  outletName: string;
  status: OrderStatus;
  totalWeight: number;
  totalPrice: number;
  paymentStatus: PaymentStatus;
  currentWorker: string;
  currentStation: string;
  pickupDriver: string;
  deliveryDriver: string;
  createdAt: string;
  updatedAt: string;
}
