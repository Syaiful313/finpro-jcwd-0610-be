import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../config";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { CreatePaymentLinkDTO } from "./dto/createPaymentLink.dto";
import { PaymentController } from "./payment.controller";
import { UpdatePaymentDTO } from "./dto/updatePayment.dto";

@autoInjectable()
export class PaymentRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly paymentController: PaymentController,
    private readonly jwtMiddleware: JwtMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.post(
      "/",
      this.jwtMiddleware.verifyToken(env().JWT_SECRET!),
      validateBody(CreatePaymentLinkDTO),
      this.paymentController.createPaymentLink,
    );
    this.router.post(
      "/xendit",
      validateBody(UpdatePaymentDTO),
      this.paymentController.updatePaymentStatus,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
