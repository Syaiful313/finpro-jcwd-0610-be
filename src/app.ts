import cors from "cors";
import express, { json } from "express";
import helmet from "helmet";
import "reflect-metadata";
import { container } from "tsyringe";
import { env } from "./config";
import { errorMiddleware } from "./middleware/error.middleware";
import { AdminRouter } from "./modules/admin/admin.router";
import { AuthRouter } from "./modules/auth/auth.router";
import { SampleRouter } from "./modules/sample/sample.router";
import { OutletRouter } from "./modules/outlet/outlet.router";
import { AttendanceRouter } from "./modules/attendance/attendance.router";
import { DriverRouter } from "./modules/driver/driver.router";
import { CronService } from "./modules/jobs/cron.service";
import { WorkerRouter } from "./modules/worker/worker.router";
import { LaundryItemRouter } from "./modules/laundry-item/laundry-item.router";
import { NotificationRouter } from "./modules/notification/notification.router";
import { UserRouter } from "./modules/user/user.router";
import { OrderRouter } from "./modules/order/order.router";
import { EmployeeRouter } from "./modules/employee/employee.router";
import { BypassRouter } from "./modules/bypass/bypass.router";
import { SalesReportRouter } from "./modules/sales-report/sales-report.router";
import { PaymentRouter } from "./modules/payment/payment.router";
import { EmployeePerformanceRouter } from "./modules/employee-performance/employee-performance.router";

export default class App {
  public app;

  constructor() {
    this.app = express();
    this.configure();
    this.routes();
    this.handleError();
    this.initializeCronJobs();
  }

  private configure(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(json());
  }

  private initializeCronJobs(): void {
    const cronService = container.resolve(CronService);
    cronService.initializeJobs();
  }

  private routes(): void {
    const sampleRouter = container.resolve(SampleRouter);
    const authRouter = container.resolve(AuthRouter);
    const adminRouter = container.resolve(AdminRouter);
    const outletRouter = container.resolve(OutletRouter);
    const attendanceRouter = container.resolve(AttendanceRouter);
    const driverRouter = container.resolve(DriverRouter);
    const laundryItemRouter = container.resolve(LaundryItemRouter);
    const workerRouter = container.resolve(WorkerRouter);
    const notificationRouter = container.resolve(NotificationRouter);
    const userRouter = container.resolve(UserRouter);
    const orderRouter = container.resolve(OrderRouter);
    const employeeRouter = container.resolve(EmployeeRouter);
    const bypassRouter = container.resolve(BypassRouter);
    const salesReportRouter = container.resolve(SalesReportRouter);
    const paymentRouter = container.resolve(PaymentRouter);
    const employeePerformanceRouter = container.resolve(
      EmployeePerformanceRouter,
    );

    this.app.get("/", (_, res) => {
      res.send("Welcome");
    });
    this.app.use("/samples", sampleRouter.getRouter());
    this.app.use("/auth", authRouter.getRouter());
    this.app.use("/admin", adminRouter.getRouter());
    this.app.use("/outlet", outletRouter.getRouter());
    this.app.use("/driver", driverRouter.getRouter());
    this.app.use("/attendances", attendanceRouter.getRouter());
    this.app.use("/worker", workerRouter.getRouter());
    this.app.use("/laundry-item", laundryItemRouter.getRouter());
    this.app.use("/notifications", notificationRouter.getRouter());
    this.app.use("/users", userRouter.getRouter());
    this.app.use("/orders", orderRouter.getRouter());
    this.app.use("/employees", employeeRouter.getRouter());
    this.app.use("/bypass-requests", bypassRouter.getRouter());
    this.app.use("/reports", salesReportRouter.getRouter());
    this.app.use("/payments", paymentRouter.getRouter());
    this.app.use(
      "/employee-performance",
      employeePerformanceRouter.getRouter(),
    );
  }

  private handleError(): void {
    this.app.use(errorMiddleware);
  }

  public start(): void {
    this.app.listen(env().PORT, "0.0.0.0", () => {
      console.log(`  ➜  [🔥] Local:   http://localhost:${env().PORT}`);
    });
  }
}
