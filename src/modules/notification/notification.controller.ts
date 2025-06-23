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
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getUserNotifications = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = Number(req.user!.id);
      const limit = Number(req.query.limit) || 5;
      const page = Number(req.query.page) || 1;
      const result = await this.notificationService.getUserNotification(
        authUserId,
        limit,
        page,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getWorkerNotifications = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user?.id;
      const query = plainToInstance(GetNotificationsDTO, req.query);
      const result = await this.notificationService.getWorkerNotifications(
        Number(authUserId),
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  markAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const { notificationId } = req.params;
      const numericNotificationId = parseInt(notificationId, 10);
      const result = await this.notificationService.markAsRead(
        Number(authUserId),
        numericNotificationId,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user?.id;
      const result = await this.notificationService.markAllAsRead(
        Number(authUserId),
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
