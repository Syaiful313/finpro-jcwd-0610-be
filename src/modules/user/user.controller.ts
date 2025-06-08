import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { UserService } from "./user.service";
import { UpdateUserDTO } from "./dto/updateUser.dto";

@injectable()
export class UserController {
  constructor(private readonly userService: UserService) {}

  getUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user!.id;
      const result = await this.userService.getUser(authUserId);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  updateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user!.id;
      const body = req.body as UpdateUserDTO;
      const result = await this.userService.updateUser(authUserId, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
