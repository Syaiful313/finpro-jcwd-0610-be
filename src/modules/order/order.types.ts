import {
  OrderStatus,
  PaymentStatus,
  WorkerTypes,
  DriverTaskStatus,
  Role,
} from "@prisma/client";

export interface CurrentUser {
  id: number;
  role: Role;
  outletId?: number;
}

export interface CustomerInfo {
  id: number;
  name: string;
  email: string;
}

export interface DetailedCustomerInfo extends CustomerInfo {
  phoneNumber?: string;
  addresses?: Address[];
  primaryAddress?: Address;
}

export interface Address {
  id: number;
  addressName: string;
  addressLine: string;
  district: string;
  city: string;
  province: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  isPrimary: boolean;
}

export interface OrderAddress {
  fullAddress: string;
  district: string;
  city: string;
  province: string;
  postalCode: string;
}

export interface OutletInfo {
  id: number;
  outletName: string;
  isActive?: boolean;
  address?: string;
  latitude?: number;
  longitude?: number;
  serviceRadius?: number;
  deliveryBaseFee?: number;
  deliveryPerKm?: number;
}

export interface WorkerInfo {
  id: number;
  name: string;
  phoneNumber?: string;
}

export interface WorkProcessStage {
  stage: string;
  label: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  startedAt: Date | null;
  completedAt: Date | null;
  worker: string | null;
}

export interface WorkProcessProgress {
  stages: WorkProcessStage[];
  summary: {
    completed: number;
    inProgress: number;
    pending: number;
    total: number;
    percentage: number;
  };
}

export interface WorkProcessInfo {
  current: CurrentWorkProcess | null;
  completed: CompletedWorkProcess[];
  progress: WorkProcessProgress;
}

export interface CurrentWorkProcess {
  id: number;
  type: WorkerTypes;
  station: string;
  worker: string;
  workerPhone?: string;
  startedAt: Date;
  notes?: string;
  bypass?: any;
}

export interface CompletedWorkProcess extends CurrentWorkProcess {
  completedAt: Date;
  duration: string;
}

export interface DriverInfo {
  id: number;
  name: string;
  phoneNumber?: string;
}

export interface PickupJobInfo {
  id: number;
  status: DriverTaskStatus;
  driver: DriverInfo | null;
  photos: string[];
  scheduledOutlet?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryJobInfo {
  id: number;
  status: DriverTaskStatus;
  driver: DriverInfo | null;
  photos: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PickupInfo {
  jobs: PickupJobInfo[];
  latest?: any;
}

export interface DeliveryInfo {
  info: DeliveryCalculationInfo | null;
  totalWeight?: number;
  jobs: DeliveryJobInfo[];
}

export interface DeliveryCalculationInfo {
  distance: number;
  calculatedFee: number;
  actualFee: number;
  baseFee: number;
  perKmFee: number;
  withinServiceRadius: boolean;
}

export interface TrackingInfo {
  currentWorker: CurrentWorkerInfo | null;
  processHistory: ProcessHistoryItem[];
  pickup: TrackingPickup | null;
  delivery: TrackingDelivery | null;
  timeline: SimpleTimelineEvent[];
}

export interface CurrentWorkerInfo {
  id: number;
  name: string;
  workerType: WorkerTypes;
  station: string;
  startedAt: Date;
  notes?: string;
  hasBypass: boolean;
}

export interface ProcessHistoryItem {
  station: string;
  worker: string;
  startedAt: Date;
  completedAt: Date;
  duration: string;
  notes?: string;
  hasBypass: boolean;
}

export interface TrackingPickup {
  id: number;
  driver: string;
  status: DriverTaskStatus;
  assignedAt: Date;
  lastUpdate: Date;
}

export interface TrackingDelivery {
  id: number;
  driver: string;
  status: DriverTaskStatus;
  assignedAt: Date;
  lastUpdate: Date;
}

export interface TimelineEvent {
  id: string;
  event: string;
  type: "ORDER" | "PICKUP" | "WORK_PROCESS" | "DELIVERY" | "NOTIFICATION";
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
  timestamp: Date;
  description: string;
  icon?: string;
  metadata?: Record<string, any>;
}

export interface SimpleTimelineEvent {
  event: string;
  timestamp: Date;
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
  description: string;
  worker?: string;
  notes?: string;
  hasBypass?: boolean;
}

export interface PricingBreakdown {
  items: number;
  delivery: number;
  total: number;
  breakdown: PricingItem[];
}

export interface PricingItem {
  name: string;
  category: string;
  pricingType: string;
  quantity: number;
  weight: number;
  pricePerUnit: number;
  totalPrice: number;
}

export interface DetailedPricingBreakdown {
  items: {
    total: number;
    breakdown: PricingItem[];
  };
  delivery: {
    fee: number;
  };
  total: number;
}

export interface PaymentInfo {
  status: PaymentStatus;
  totalAmount: number;
  paidAt?: Date;
  breakdown: {
    itemsTotal: number;
    deliveryFee: number;
    grandTotal: number;
  };
  xendit?: XenditInfo;
  actions: PaymentActions;
  statusInfo: PaymentStatusInfo;
}

export interface XenditInfo {
  xenditId: string;
  invoiceUrl: string;
  successRedirectUrl: string;
  expiryDate: Date;
  xenditStatus: string;
  isExpired: boolean;
}

export interface PaymentActions {
  canPay: boolean;
  canRefund: boolean;
  canGenerateNewInvoice: boolean;
}

export interface PaymentStatusInfo {
  isPaid: boolean;
  isWaitingPayment: boolean;
  isOverdue: boolean;
  paymentMethod: string | null;
  timeRemaining: string | null;
}

export interface OrderItemInfo {
  id: number;
  laundryItem: {
    id: number;
    name: string;
    category: string;
    basePrice: number;
    pricingType: string;
  };
  quantity: number;
  weight: number;
  pricePerUnit: number;
  color?: string;
  brand?: string;
  materials?: string;
  totalPrice: number;
  details: OrderItemDetail[];
  createdAt: Date;
}

export interface OrderItemDetail {
  id: number;
  name: string;
  qty: number;
}

export interface OrderSchedule {
  scheduledPickupTime?: Date;
  actualPickupTime?: Date;
  scheduledDeliveryTime?: Date;
  actualDeliveryTime?: Date;
}

export interface OrderListItem {
  uuid: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  totalWeight?: number;
  totalPrice?: number;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
  customer: CustomerInfo;
  outlet: OutletInfo;
  tracking: TrackingInfo;
}

export interface PendingOrderItem {
  uuid: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  scheduledPickupTime?: Date;
  actualPickupTime?: Date;
  createdAt: Date;
  updatedAt: Date;
  customer: CustomerInfo;
  address: OrderAddress;
  customerCoordinates: {
    latitude: number;
    longitude: number;
  } | null;
  outlet: OutletInfo;
  pickupInfo: any;
}

export interface OrderDetailView {
  uuid: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
  customer: DetailedCustomerInfo;
  outlet: OutletInfo;
  deliveryAddress: OrderAddress;
  schedule: OrderSchedule;
  items: OrderItemInfo[];
  pricing: PricingBreakdown;
  payment: PaymentInfo;
  delivery: DeliveryInfo;
  pickup: PickupInfo;
  workProcess: WorkProcessInfo;
  notifications?: any[];
  timeline: TimelineEvent[];
}

export interface OrderMetadata {
  totalItems: number;
  totalProcesses: number;
  completedProcesses: number;
  hasActiveBypass: boolean;
  estimatedCompletion: string | null;
}

export interface OrderDetailResult {
  uuid: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
  customer: DetailedCustomerInfo;
  address: OrderAddress;
  outlet: OutletInfo;
  schedule: OrderSchedule;
  totalWeight?: number;
  pricing: DetailedPricingBreakdown;
  items: any[];
  workProcess: {
    progress: any;
    current: any;
    completed: any[];
    all: any[];
  };
  pickup: PickupInfo;
  delivery: any;
  timeline: TimelineEvent[];
  metadata: OrderMetadata;
}

export interface ExportableOrder {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  outletName: string;
  status: OrderStatus;
  totalWeight?: number;
  totalPrice?: number;
  paymentStatus: PaymentStatus;
  currentWorker: string;
  currentStation: string;
  pickupDriver: string;
  deliveryDriver: string;
  createdAt: Date;
  updatedAt: Date;
}
