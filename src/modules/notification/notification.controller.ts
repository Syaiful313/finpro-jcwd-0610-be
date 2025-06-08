import { injectable } from "tsyringe";
import { NotificationService } from "./notification.service";
import { NextFunction, Request, Response } from "express";
import { plainToInstance } from "class-transformer";
import { GetNotificationsDTO } from "./dto/get-notif.dto";

@injectable()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  getDriverNotifications = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user?.id;
      const query = plainToInstance(GetNotificationsDTO, req.query);
      const result = await this.notificationService.getDriverNotifications(
        Number(authUserId),
        query,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
