import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { UpdateUserDTO } from "./dto/updateUser.dto";
import { UserService } from "./user.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { CreateUserDTO } from "../admin/dto/create-user.dto";
import { CreateAddressDTO } from "./dto/createAddress.dto";
import { EditAddressDTO } from "./dto/editAddress.dto";

@injectable()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

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

  uploadProfilePic = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user!.id;
      const file = req.file;
      if (!file) {
        throw new ApiError("No file uploaded", 400);
      }
      const uploadResult = await this.cloudinaryService.upload(file);
      const uploadPath = uploadResult.secure_url;
      const result = await this.userService.uploadProfilePic(
        authUserId,
        uploadPath,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  createUserAddress = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authUserId = req.user!.id;
      const body = req.body as CreateAddressDTO;
      const result = await this.userService.createUserAddress(authUserId, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  editAddress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user!.id;
      const body = req.body as EditAddressDTO;
      const result = await this.userService.editAddress(authUserId, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  deleteAddress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user!.id;
      const addressId = Number(req.params.id);
      const result = await this.userService.deleteAddress(
        authUserId,
        addressId,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
