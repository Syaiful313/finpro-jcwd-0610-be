import { PrismaClient, Role, OrderStatus, PaymentStatus, WorkerTypes, DriverTaskStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Add type interfaces for better type safety
interface OutletType {
  id: number;
  outletName: string;
  address: string;
  latitude: number;
  longitude: number;
  serviceRadius: number;
  deliveryBaseFee: number;
  deliveryPerKm: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface UserType {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  password: string | null;
  role: Role;
  phoneNumber: string | null;
  profilePic: string | null;
  isVerified: boolean;
  provider: any;
  outletId: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface EmployeeType {
  id: number;
  userId: number;
  outletId: number;
  npwp: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  user: UserType;
}

interface LaundryItemType {
  id: number;
  name: string;
  category: string;
  basePrice: number;
  pricingType: any;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface OrderType {
  uuid: string;
  userId: number;
  outletId: number;
  addressLine: string;
  district: string;
  city: string;
  province: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  orderNumber: string;
  orderStatus: OrderStatus;
  scheduledPickupTime: Date | null;
  actualPickupTime: Date | null;
  scheduledDeliveryTime: Date | null;
  actualDeliveryTime: Date | null;
  totalDeliveryFee: number | null;
  totalWeight: number | null;
  totalPrice: number | null;
  paymentStatus: PaymentStatus;
  xenditId: string | null;
  invoiceUrl: string | null;
  successRedirectUrl: string | null;
  xenditExpiryDate: Date | null;
  xenditPaymentStatus: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateOrderNumber(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `ORD-${year}${month}${day}${random}`;
}

async function seedSalesReportData() {
  console.log('🌱 Starting to seed sales report data...');

  try {
    console.log('📍 Creating outlets...');
    const outletData = [
      {
        outletName: 'Laundry Yogyakarta 1',
        address: 'Jl. Kaliurang No. 1, Yogyakarta',
        latitude: -7.7645,
        longitude: 110.3827,
        serviceRadius: 10.0,
        deliveryBaseFee: 5000,
        deliveryPerKm: 2000,
        isActive: true
      },
      {
        outletName: 'Laundry Yogyakarta 2',
        address: 'Jl. Parangtritis No. 5, Yogyakarta',
        latitude: -7.8481,
        longitude: 110.3453,
        serviceRadius: 15.0,
        deliveryBaseFee: 4000,
        deliveryPerKm: 1500,
        isActive: true
      },
      {
        outletName: 'Laundry Yogyakarta 3',
        address: 'Jl. Gejayan No. 9, Yogyakarta',
        latitude: -7.7828,
        longitude: 110.4081,
        serviceRadius: 12.0,
        deliveryBaseFee: 4500,
        deliveryPerKm: 1800,
        isActive: true
      }
    ];

    // Fix: Add explicit type annotation
    const outlets: OutletType[] = [];
    for (const data of outletData) {
      let outlet = await prisma.outlet.findFirst({
        where: { 
          outletName: data.outletName,
          deletedAt: null
        }
      });

      if (!outlet) {
        outlet = await prisma.outlet.create({ data });
        console.log(`✅ Created outlet: ${data.outletName}`);
      } else {
        console.log(`⚠️  Outlet already exists: ${data.outletName}`);
      }
      outlets.push(outlet as OutletType);
    }

    console.log('👥 Creating users...');
    const hashedPassword = await argon2.hash('password123');

    const userData = [
      // ✅ SUPER ADMIN
      {
        firstName: 'Super',
        lastName: 'Admin',
        email: 'admin@laundry.com',
        password: hashedPassword,
        role: Role.ADMIN,
        phoneNumber: '081234567890',
        isVerified: true
      },
      
      // ✅ OUTLET ADMINS
      {
        firstName: 'Outlet1',
        lastName: 'Admin',
        email: 'outlet1.admin@laundry.com',
        password: hashedPassword,
        role: Role.OUTLET_ADMIN,
        phoneNumber: '081234567891',
        isVerified: true,
        outletId: outlets[0].id
      },
      {
        firstName: 'Outlet2',
        lastName: 'Admin',
        email: 'outlet2.admin@laundry.com',
        password: hashedPassword,
        role: Role.OUTLET_ADMIN,
        phoneNumber: '081234567892',
        isVerified: true,
        outletId: outlets[1].id
      },
      {
        firstName: 'Outlet3',
        lastName: 'Admin',
        email: 'outlet3.admin@laundry.com',
        password: hashedPassword,
        role: Role.OUTLET_ADMIN,
        phoneNumber: '081234567893',
        isVerified: true,
        outletId: outlets[2].id
      },

      // ✅ DRIVERS (per outlet)
      {
        firstName: 'Driver1',
        lastName: 'Outlet1',
        email: 'driver1.outlet1@laundry.com',
        password: hashedPassword,
        role: Role.DRIVER,
        phoneNumber: '081234567900',
        isVerified: true
      },
      {
        firstName: 'Driver2',
        lastName: 'Outlet1',
        email: 'driver2.outlet1@laundry.com',
        password: hashedPassword,
        role: Role.DRIVER,
        phoneNumber: '081234567901',
        isVerified: true
      },
      {
        firstName: 'Driver1',
        lastName: 'Outlet2',
        email: 'driver1.outlet2@laundry.com',
        password: hashedPassword,
        role: Role.DRIVER,
        phoneNumber: '081234567902',
        isVerified: true
      },
      {
        firstName: 'Driver2',
        lastName: 'Outlet2',
        email: 'driver2.outlet2@laundry.com',
        password: hashedPassword,
        role: Role.DRIVER,
        phoneNumber: '081234567905',
        isVerified: true
      },
      {
        firstName: 'Driver1',
        lastName: 'Outlet3',
        email: 'driver1.outlet3@laundry.com',
        password: hashedPassword,
        role: Role.DRIVER,
        phoneNumber: '081234567903',
        isVerified: true
      },

      // ✅ WORKERS (washing, ironing, packing per outlet)
      // Outlet 1 Workers
      {
        firstName: 'Washer1',
        lastName: 'Outlet1',
        email: 'washer1.outlet1@laundry.com',
        password: hashedPassword,
        role: Role.WORKER,
        phoneNumber: '081234567910',
        isVerified: true
      },
      {
        firstName: 'Washer2',
        lastName: 'Outlet1',
        email: 'washer2.outlet1@laundry.com',
        password: hashedPassword,
        role: Role.WORKER,
        phoneNumber: '081234567913',
        isVerified: true
      },
      {
        firstName: 'Ironer1',
        lastName: 'Outlet1',
        email: 'ironer1.outlet1@laundry.com',
        password: hashedPassword,
        role: Role.WORKER,
        phoneNumber: '081234567911',
        isVerified: true
      },
      {
        firstName: 'Packer1',
        lastName: 'Outlet1',
        email: 'packer1.outlet1@laundry.com',
        password: hashedPassword,
        role: Role.WORKER,
        phoneNumber: '081234567912',
        isVerified: true
      },
      
      // Outlet 2 Workers
      {
        firstName: 'Washer1',
        lastName: 'Outlet2',
        email: 'washer1.outlet2@laundry.com',
        password: hashedPassword,
        role: Role.WORKER,
        phoneNumber: '081234567920',
        isVerified: true
      },
      {
        firstName: 'Ironer1',
        lastName: 'Outlet2',
        email: 'ironer1.outlet2@laundry.com',
        password: hashedPassword,
        role: Role.WORKER,
        phoneNumber: '081234567921',
        isVerified: true
      },
      {
        firstName: 'Ironer2',
        lastName: 'Outlet2',
        email: 'ironer2.outlet2@laundry.com',
        password: hashedPassword,
        role: Role.WORKER,
        phoneNumber: '081234567923',
        isVerified: true
      },
      {
        firstName: 'Packer1',
        lastName: 'Outlet2',
        email: 'packer1.outlet2@laundry.com',
        password: hashedPassword,
        role: Role.WORKER,
        phoneNumber: '081234567922',
        isVerified: true
      },

      // Outlet 3 Workers
      {
        firstName: 'Washer1',
        lastName: 'Outlet3',
        email: 'washer1.outlet3@laundry.com',
        password: hashedPassword,
        role: Role.WORKER,
        phoneNumber: '081234567930',
        isVerified: true
      },
      {
        firstName: 'Ironer1',
        lastName: 'Outlet3',
        email: 'ironer1.outlet3@laundry.com',
        password: hashedPassword,
        role: Role.WORKER,
        phoneNumber: '081234567931',
        isVerified: true
      },
      {
        firstName: 'Packer1',
        lastName: 'Outlet3',
        email: 'packer1.outlet3@laundry.com',
        password: hashedPassword,
        role: Role.WORKER,
        phoneNumber: '081234567932',
        isVerified: true
      },

      // ✅ CUSTOMERS
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@gmail.com',
        password: hashedPassword,
        role: Role.CUSTOMER,
        phoneNumber: '081234567894',
        isVerified: true
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@gmail.com',
        password: hashedPassword,
        role: Role.CUSTOMER,
        phoneNumber: '081234567895',
        isVerified: true
      },
      {
        firstName: 'Bob',
        lastName: 'Wilson',
        email: 'bob.wilson@gmail.com',
        password: hashedPassword,
        role: Role.CUSTOMER,
        phoneNumber: '081234567896',
        isVerified: true
      },
      {
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'alice.johnson@gmail.com',
        password: hashedPassword,
        role: Role.CUSTOMER,
        phoneNumber: '081234567897',
        isVerified: true
      },
      {
        firstName: 'Charlie',
        lastName: 'Brown',
        email: 'charlie.brown@gmail.com',
        password: hashedPassword,
        role: Role.CUSTOMER,
        phoneNumber: '081234567898',
        isVerified: true
      }
    ];

    // Fix: Add explicit type annotation
    const users: UserType[] = [];
    for (const data of userData) {
      let user = await prisma.user.findFirst({
        where: { 
          email: data.email,
          deletedAt: null
        }
      });

      if (!user) {
        user = await prisma.user.create({ data });
        console.log(`✅ Created user: ${data.email} - Role: ${data.role}${data.outletId ? ` - OutletId: ${data.outletId}` : ''}`);
      } else {
        // ✅ Update existing OUTLET_ADMIN with outletId if missing
        if (data.role === Role.OUTLET_ADMIN && !user.outletId && data.outletId) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { outletId: data.outletId }
          });
          console.log(`✅ Updated user ${data.email} with outletId: ${data.outletId}`);
        } else {
          console.log(`⚠️  User already exists: ${data.email}`);
        }
      }
      users.push(user as UserType);
    }

    // ✅ CREATE EMPLOYEE RECORDS for OUTLET_ADMIN, DRIVER, and WORKER
    console.log('👔 Creating employee records...');
    
    const employeeTypes = [
      'OUTLET_ADMIN',
      'DRIVER', 
      'WORKER'
    ];

    // Fix: Add explicit type annotation
    const employees: (EmployeeType & { outletId: number })[] = [];
    for (const user of users) {
      if (employeeTypes.includes(user.role)) {
        let outletId: number;

        // Determine outlet assignment based on role and email
        if (user.role === 'OUTLET_ADMIN') {
          outletId = user.outletId!; // Already assigned in user table
        } else if (user.role === 'DRIVER') {
          // Extract outlet from email pattern: driver1.outlet1@laundry.com
          const emailMatch = user.email.match(/outlet(\d+)/);
          const outletNumber = emailMatch ? parseInt(emailMatch[1]) : 1;
          outletId = outlets[outletNumber - 1]?.id || outlets[0].id;
        } else if (user.role === 'WORKER') {
          // Extract outlet from email pattern: washer1.outlet1@laundry.com
          const emailMatch = user.email.match(/outlet(\d+)/);
          const outletNumber = emailMatch ? parseInt(emailMatch[1]) : 1;
          outletId = outlets[outletNumber - 1]?.id || outlets[0].id;
        } else {
          continue;
        }

        // Check if employee record already exists
        let existingEmployee = await prisma.employee.findFirst({
          where: {
            userId: user.id,
            deletedAt: null
          }
        });

        if (!existingEmployee) {
          // Generate dummy NPWP for employee
          const npwp = `${String(Math.floor(Math.random() * 900000000000000) + 100000000000000)}`;
          
          const employeeData = {
            userId: user.id,
            outletId: outletId,
            npwp: npwp, // Required field
          };

          existingEmployee = await prisma.employee.create({
            data: employeeData
          });

          console.log(`✅ Created employee: ${user.email} - ${user.role} at Outlet ${outletId}`);
        } else {
          console.log(`⚠️  Employee record already exists for: ${user.email}`);
        }

        employees.push({
          ...existingEmployee,
          user,
          outletId
        } as EmployeeType & { outletId: number });
      }
    }

    console.log('👕 Creating laundry items...');
    const laundryItemsData = [
      { name: 'Kaos', category: 'Pakaian Atas', basePrice: 5000, pricingType: 'PER_PIECE' as const },
      { name: 'Kemeja', category: 'Pakaian Atas', basePrice: 8000, pricingType: 'PER_PIECE' as const },
      { name: 'Celana Panjang', category: 'Pakaian Bawah', basePrice: 10000, pricingType: 'PER_PIECE' as const },
      { name: 'Celana Pendek', category: 'Pakaian Bawah', basePrice: 7000, pricingType: 'PER_PIECE' as const },
      { name: 'Celana Dalam', category: 'Pakaian Dalam', basePrice: 3000, pricingType: 'PER_PIECE' as const },
      { name: 'Jaket', category: 'Pakaian Luar', basePrice: 15000, pricingType: 'PER_PIECE' as const }
    ];

    // Fix: Add explicit type annotation
    const laundryItems: LaundryItemType[] = [];
    for (const itemData of laundryItemsData) {
      let item = await prisma.laundryItem.findFirst({
        where: { 
          name: itemData.name,
          deletedAt: null
        }
      });

      if (!item) {
        item = await prisma.laundryItem.create({ data: itemData });
        console.log(`✅ Created laundry item: ${itemData.name}`);
      } else {
        console.log(`⚠️  Laundry item already exists: ${itemData.name}`);
      }
      laundryItems.push(item as LaundryItemType);
    }

    console.log('📦 Creating orders with diverse date ranges...');
    const customers = users.filter(u => u.role === Role.CUSTOMER);
    
    // ✅ CREATE ORDERS FOR DIFFERENT PERIODS (for better testing)
    const periods = [
      { start: new Date('2024-01-01'), end: new Date('2024-01-31'), count: 30 }, // January 2024
      { start: new Date('2024-02-01'), end: new Date('2024-02-29'), count: 25 }, // February 2024
      { start: new Date('2024-03-01'), end: new Date('2024-03-31'), count: 35 }, // March 2024
      { start: new Date('2025-01-01'), end: new Date('2025-01-31'), count: 40 }, // January 2025
      { start: new Date('2025-02-01'), end: new Date('2025-02-28'), count: 30 }, // February 2025
      { start: new Date('2025-03-01'), end: new Date('2025-03-31'), count: 45 }, // March 2025
    ];

    // Fix: Add explicit type annotation
    const orders: OrderType[] = [];
    let totalOrderCount = 0;

    for (const period of periods) {
      console.log(`📅 Creating ${period.count} orders for ${period.start.toDateString()} - ${period.end.toDateString()}`);
      
      for (let i = 0; i < period.count; i++) {
        const customer = customers[Math.floor(Math.random() * customers.length)];
        const outlet = outlets[Math.floor(Math.random() * outlets.length)];
        const orderDate = randomDate(period.start, period.end);
        const paidDate = new Date(orderDate.getTime() + Math.random() * 24 * 60 * 60 * 1000);
        const totalWeight = Math.round((Math.random() * 4 + 1) * 10) / 10;
        const totalPrice: number = Math.floor(Math.random() * 150000 + 50000);
        const deliveryFee: number = Math.floor(Math.random() * 15000 + 5000);
        const orderNumber = generateOrderNumber(orderDate);

        const existingOrder = await prisma.order.findFirst({ where: { orderNumber } });
        if (existingOrder) {
          console.log(`⚠️  Order ${orderNumber} already exists, skipping...`);
          orders.push(existingOrder as OrderType);
          continue;
        }

        const order = await prisma.order.create({
          data: {
            userId: customer.id,
            outletId: outlet.id,
            addressLine: `Jl. Random ${totalOrderCount + 1}`,
            district: 'Umbulharjo',
            city: 'Yogyakarta',
            province: 'DIY',
            postalCode: '55161',
            latitude: outlet.latitude + (Math.random() - 0.5) * 0.1,
            longitude: outlet.longitude + (Math.random() - 0.5) * 0.1,
            orderNumber,
            orderStatus: OrderStatus.COMPLETED,
            paymentStatus: PaymentStatus.PAID,
            totalWeight,
            totalPrice,
            totalDeliveryFee: deliveryFee,
            paidAt: paidDate,
            createdAt: orderDate,
            updatedAt: paidDate
          }
        });
        orders.push(order as OrderType);
        totalOrderCount++;

        // Create order items
        const itemCount = Math.floor(Math.random() * 3) + 2;
        for (let j = 0; j < itemCount; j++) {
          const item = laundryItems[Math.floor(Math.random() * laundryItems.length)];
          const quantity = Math.floor(Math.random() * 5) + 1;
          const itemWeight = quantity * 0.2;
          const itemTotalPrice = quantity * item.basePrice;

          await prisma.orderItem.create({
            data: {
              orderId: order.uuid,
              laundryItemId: item.id,
              quantity,
              weight: itemWeight,
              pricePerUnit: item.basePrice,
              totalPrice: itemTotalPrice
            }
          });
        }
      }
    }

    // ✅ CREATE PICKUP JOBS FOR DRIVERS
    console.log('🚚 Creating pickup jobs for drivers...');
    const drivers = employees.filter(emp => emp.user.role === Role.DRIVER);
    
    for (const order of orders) {
      // Get drivers from the same outlet as the order
      const outletDrivers = drivers.filter(d => d.outletId === order.outletId);
      if (outletDrivers.length === 0) continue;

      const driver = outletDrivers[Math.floor(Math.random() * outletDrivers.length)];
      const pickupDate = new Date(order.createdAt.getTime() + Math.random() * 2 * 60 * 60 * 1000); // 0-2 hours after order
      
      // Check if pickup job already exists
      const existingPickup = await prisma.pickUpJob.findFirst({
        where: { orderId: order.uuid }
      });

      if (!existingPickup) {
        await prisma.pickUpJob.create({
          data: {
            employeeId: driver.id,
            orderId: order.uuid,
            status: Math.random() > 0.1 ? DriverTaskStatus.COMPLETED : DriverTaskStatus.IN_PROGRESS,
            pickUpPhotos: `pickup_photo_${order.orderNumber}.jpg`,
            notes: `Pickup completed for order ${order.orderNumber}`,
            createdAt: pickupDate,
            updatedAt: pickupDate
          }
        });
      }
    }

    // ✅ CREATE DELIVERY JOBS FOR DRIVERS
    console.log('🚛 Creating delivery jobs for drivers...');
    
    for (const order of orders) {
      // Get drivers from the same outlet as the order
      const outletDrivers = drivers.filter(d => d.outletId === order.outletId);
      if (outletDrivers.length === 0) continue;

      const driver = outletDrivers[Math.floor(Math.random() * outletDrivers.length)];
      const deliveryDate = new Date(order.paidAt!.getTime() + Math.random() * 2 * 60 * 60 * 1000); // 0-2 hours after payment
      
      // Check if delivery job already exists
      const existingDelivery = await prisma.deliveryJob.findFirst({
        where: { orderId: order.uuid }
      });

      if (!existingDelivery) {
        await prisma.deliveryJob.create({
          data: {
            employeeId: driver.id,
            orderId: order.uuid,
            status: Math.random() > 0.05 ? DriverTaskStatus.COMPLETED : DriverTaskStatus.IN_PROGRESS,
            deliveryPhotos: `delivery_photo_${order.orderNumber}.jpg`,
            notes: `Delivery completed for order ${order.orderNumber}`,
            createdAt: deliveryDate,
            updatedAt: deliveryDate
          }
        });
      }
    }

    // ✅ CREATE ORDER WORK PROCESSES FOR WORKERS
    console.log('🧺 Creating order work processes for workers...');
    const workers = employees.filter(emp => emp.user.role === Role.WORKER);
    
    for (const order of orders) {
      // Get workers from the same outlet as the order
      const outletWorkers = workers.filter(w => w.outletId === order.outletId);
      if (outletWorkers.length === 0) continue;

      const workerTypes = [WorkerTypes.WASHING, WorkerTypes.IRONING, WorkerTypes.PACKING];
      
      for (const workerType of workerTypes) {
        // Find workers of specific type (based on email pattern)
        let typeWorkers = outletWorkers;
        if (workerType === WorkerTypes.WASHING) {
          typeWorkers = outletWorkers.filter(w => w.user.email.includes('washer'));
        } else if (workerType === WorkerTypes.IRONING) {
          typeWorkers = outletWorkers.filter(w => w.user.email.includes('ironer'));
        } else if (workerType === WorkerTypes.PACKING) {
          typeWorkers = outletWorkers.filter(w => w.user.email.includes('packer'));
        }

        // If no specific type workers, use any worker
        if (typeWorkers.length === 0) {
          typeWorkers = outletWorkers;
        }

        const worker = typeWorkers[Math.floor(Math.random() * typeWorkers.length)];
        
        // Calculate work completion time based on stage
        let workDate: Date;
        if (workerType === WorkerTypes.WASHING) {
          workDate = new Date(order.createdAt.getTime() + 4 * 60 * 60 * 1000); // 4 hours after order
        } else if (workerType === WorkerTypes.IRONING) {
          workDate = new Date(order.createdAt.getTime() + 8 * 60 * 60 * 1000); // 8 hours after order
        } else {
          workDate = new Date(order.createdAt.getTime() + 12 * 60 * 60 * 1000); // 12 hours after order
        }

        // Check if work process already exists
        const existingWorkProcess = await prisma.orderWorkProcess.findFirst({
          where: { 
            orderId: order.uuid,
            workerType: workerType
          }
        });

        if (!existingWorkProcess) {
          await prisma.orderWorkProcess.create({
            data: {
              employeeId: worker.id,
              orderId: order.uuid,
              workerType: workerType,
              notes: `${workerType.toLowerCase()} process completed for order ${order.orderNumber}`,
              completedAt: Math.random() > 0.05 ? workDate : null, // 95% completion rate
              createdAt: workDate,
              updatedAt: workDate
            }
          });
        }
      }
    }

    console.log('✅ Sales report data seeding completed!');
    console.log(`📊 Created:`);
    console.log(`   - ${outlets.length} outlets`);
    console.log(`   - ${users.length} users`);
    console.log(`   - ${employees.length} employee records`);
    console.log(`   - ${laundryItems.length} laundry items`);
    console.log(`   - ${orders.length} orders across multiple periods`);

    // ✅ GET PERFORMANCE DATA COUNT
    const pickupJobsCount = await prisma.pickUpJob.count();
    const deliveryJobsCount = await prisma.deliveryJob.count();
    const workProcessesCount = await prisma.orderWorkProcess.count();

    console.log(`   - ${pickupJobsCount} pickup jobs`);
    console.log(`   - ${deliveryJobsCount} delivery jobs`);
    console.log(`   - ${workProcessesCount} work processes`);

    // ✅ DETAILED OUTLET SUMMARY WITH EMPLOYEE PERFORMANCE
    console.log('\n📈 OUTLET EMPLOYEE PERFORMANCE SUMMARY:');
    for (const outlet of outlets) {
      const outletOrders = orders.filter(o => o.outletId === outlet.id);
      const outletIncome = outletOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
      const outletAdmin = users.find(u => u.role === Role.OUTLET_ADMIN && u.outletId === outlet.id);
      
      // Get employee performance per outlet
      const outletEmployees = employees.filter(e => e.outletId === outlet.id);
      const outletDrivers = outletEmployees.filter(e => e.user.role === 'DRIVER');
      const outletWorkers = outletEmployees.filter(e => e.user.role === 'WORKER');
      
      console.log(`   🏪 ${outlet.outletName}:`);
      console.log(`      - Admin: ${outletAdmin?.email || 'No admin assigned'}`);
      console.log(`      - Orders: ${outletOrders.length}`);
      console.log(`      - Total Income: Rp ${outletIncome.toLocaleString('id-ID')}`);
      
      // Driver Performance
      console.log(`      📊 Driver Performance:`);
      for (const driver of outletDrivers) {
        const pickupJobs = await prisma.pickUpJob.count({
          where: { employeeId: driver.id }
        });
        const deliveryJobs = await prisma.deliveryJob.count({
          where: { employeeId: driver.id }
        });
        const completedPickups = await prisma.pickUpJob.count({
          where: { 
            employeeId: driver.id,
            status: DriverTaskStatus.COMPLETED
          }
        });
        const completedDeliveries = await prisma.deliveryJob.count({
          where: { 
            employeeId: driver.id,
            status: DriverTaskStatus.COMPLETED
          }
        });
        
        const totalJobs = pickupJobs + deliveryJobs;
        const completedJobs = completedPickups + completedDeliveries;
        const completionRate = totalJobs > 0 ? (completedJobs / totalJobs * 100).toFixed(1) : '0';
        
        console.log(`         - ${driver.user.firstName} ${driver.user.lastName}: ${totalJobs} jobs (${completionRate}% completion)`);
        console.log(`           Pickup: ${pickupJobs} (${completedPickups} completed)`);
        console.log(`           Delivery: ${deliveryJobs} (${completedDeliveries} completed)`);
      }
      
      // Worker Performance
      console.log(`      🧺 Worker Performance:`);
      for (const worker of outletWorkers) {
        const workProcesses = await prisma.orderWorkProcess.count({
          where: { employeeId: worker.id }
        });
        const completedProcesses = await prisma.orderWorkProcess.count({
          where: { 
            employeeId: worker.id,
            completedAt: { not: null }
          }
        });
        
        const washingJobs = await prisma.orderWorkProcess.count({
          where: { 
            employeeId: worker.id,
            workerType: WorkerTypes.WASHING
          }
        });
        const ironingJobs = await prisma.orderWorkProcess.count({
          where: { 
            employeeId: worker.id,
            workerType: WorkerTypes.IRONING
          }
        });
        const packingJobs = await prisma.orderWorkProcess.count({
          where: { 
            employeeId: worker.id,
            workerType: WorkerTypes.PACKING
          }
        });
        
        const completionRate = workProcesses > 0 ? (completedProcesses / workProcesses * 100).toFixed(1) : '0';
        
        console.log(`         - ${worker.user.firstName} ${worker.user.lastName}: ${workProcesses} jobs (${completionRate}% completion)`);
        console.log(`           Washing: ${washingJobs}, Ironing: ${ironingJobs}, Packing: ${packingJobs}`);
      }
    }

    // ✅ ROLE SUMMARY
    console.log('\n👥 USER ROLE SUMMARY:');
    const roleStats = users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(roleStats).forEach(([role, count]) => {
      console.log(`   - ${role}: ${count} users`);
    });

    // ✅ PERIOD SUMMARY
    console.log('\n📅 PERIOD SUMMARY:');
    for (const period of periods) {
      const periodOrders = orders.filter(o => {
        const orderDate = new Date(o.createdAt);
        return orderDate >= period.start && orderDate <= period.end;
      });
      const periodIncome = periodOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
      
      console.log(`   📆 ${period.start.toISOString().split('T')[0]} to ${period.end.toISOString().split('T')[0]}:`);
      console.log(`      - Orders: ${periodOrders.length}`);
      console.log(`      - Income: Rp ${periodIncome.toLocaleString('id-ID')}`);
    }

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedSalesReportData()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedSalesReportData };