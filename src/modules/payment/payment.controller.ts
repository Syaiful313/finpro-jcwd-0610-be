import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { PaymentService } from "./payment.service";
import { CreatePaymentLinkDTO } from "./dto/createPaymentLink.dto";
import { UpdatePaymentDTO } from "./dto/updatePayment.dto";

@injectable()
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  createPaymentLink = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.user!.id;
      const body = req.body as CreatePaymentLinkDTO;
      const result = await this.paymentService.createPaymentLink(authUserId, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  updatePaymentStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as UpdatePaymentDTO;
      const result = await this.paymentService.updatePaymentStatus(body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
