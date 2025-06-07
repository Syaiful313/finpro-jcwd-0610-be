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

    this.app.get("/", (_, res) => {
      res.send("Welcome");
    });
    this.app.use("/samples", sampleRouter.getRouter());
    this.app.use("/auth", authRouter.getRouter());
    this.app.use("/admin", adminRouter.getRouter());
    this.app.use("/outlet", outletRouter.getRouter());
    this.app.use("/driver", driverRouter.getRouter());
    this.app.use("/attendance", attendanceRouter.getRouter());
    this.app.use("/worker", workerRouter.getRouter());
    this.app.use("/laundry-item", laundryItemRouter.getRouter());
    this.app.use("/notification", notificationRouter.getRouter());
  }

  private handleError(): void {
    this.app.use(errorMiddleware);
  }

  private initializeCronJobs(): void {
    const cronService = container.resolve(CronService);
    cronService.initializeJobs();
  }

  public start(): void {
    this.app.listen(env().PORT, () => {
      console.log(`  ➜  [🔥] Local:   http://localhost:${env().PORT}`);
    });
  }
}
