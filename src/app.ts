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

export default class App {
  public app;

  constructor() {
    this.app = express();
    this.configure();
    this.routes();
    this.handleError();
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

    this.app.get("/", (_, res) => {
      res.send("Welcome");
    });
    this.app.use("/samples", sampleRouter.getRouter());
    this.app.use("/auth", authRouter.getRouter());
    this.app.use("/admin", adminRouter.getRouter());
    this.app.use("/outlet", outletRouter.getRouter());

    this.app.use("/attendance", attendanceRouter.getRouter());
  }

  private handleError(): void {
    this.app.use(errorMiddleware);
  }

  public start(): void {
    this.app.listen(env().PORT, () => {
      console.log(`  ➜  [API] Local:   http://localhost:${env().PORT}`);
    });
  }
}
