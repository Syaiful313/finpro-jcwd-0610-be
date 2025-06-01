import { NextFunction, Request, Response } from "express";
import { AttendanceService } from "./attendance.service";
import { plainToInstance } from "class-transformer";
import {
  GetAttendanceHistoryDTO,
  GetAttendanceReportDTO,
} from "./dto/attendance.dto";
import { injectable } from "tsyringe";

@injectable()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  clockIn = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user!.id;
      const result = await this.attendanceService.clockIn(authUserId);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  clockOut = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user!.id;
      const result = await this.attendanceService.clockOut(authUserId);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getAttendances = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const query = plainToInstance(GetAttendanceReportDTO, req.query);
      const result = await this.attendanceService.getAttendances(
        Number(authUserId), // req.user?.id,
        query,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
