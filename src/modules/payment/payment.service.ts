import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePaymentLinkDTO } from "./dto/createPaymentLink.dto";
import xenditService from "../../utils/xendit";
import { UpdatePaymentDTO } from "./dto/updatePayment.dto";

@injectable()
export class PaymentService {
  constructor(private readonly prisma: PrismaService) {}

  createPaymentLink = async (
    authUserId: number,
    body: CreatePaymentLinkDTO,
  ) => {
    const { uuid } = body;
    const user = await this.prisma.user.findUnique({
      where: { id: authUserId },
    });

    if (!user) {
      throw new ApiError("Invalid user id", 404);
    }

    const order = await this.prisma.order.findUnique({
      where: { uuid },
    });

    if (!order) {
      throw new ApiError("Order not found", 400);
    }

    if (order.userId !== authUserId) {
      throw new ApiError("Unauthorised", 400);
    }

    if (order.totalPrice === null) {
      throw new ApiError("Total price is null", 400);
    }

    const params = {
      externalId: uuid,
      amount: order.totalPrice,
      email: user.email,
      successRedirectUrl: `${process.env.FRONTEND_URL}/order/${order.uuid}`,
    };

    const invoice = await xenditService.createInvoice(params);

    const { id, invoiceUrl, successRedirectUrl, expiryDate, status } = invoice;

    const updatedOrder = await this.prisma.order.update({
      where: { uuid: order.uuid },
      data: {
        xenditId: id,
        invoiceUrl: invoiceUrl,
        successRedirectUrl: successRedirectUrl,
        xenditExpiryDate: expiryDate,
        xenditPaymentStatus: status,
      },
    });

    return { updatedOrder };
  };

  updatePaymentStatus = async (body: UpdatePaymentDTO) => {
    const { id, status, paid_at } = body;
    const order = await this.prisma.order.findFirst({
      where: { xenditId: id },
    });

    if (order?.orderStatus === "WAITING_PAYMENT") {
      await this.prisma.order.update({
        where: { xenditId: id },
        data: { orderStatus: "READY_FOR_DELIVERY" },
      });

      await this.prisma.notification.create({
        data: {
          message: "Order is ready to deliver",
          orderStatus: "READY_FOR_DELIVERY",
          notifType: "NEW_DELIVERY_REQUEST",
          role: "DRIVER",
        },
      });
      await this.prisma.deliveryJob.create({
        data: {
          orderId: order.uuid,
        },
      });
    }

    const updatedOrder = await this.prisma.order.update({
      where: { xenditId: id },
      data: {
        paymentStatus: "PAID",
        xenditPaymentStatus: status,
        paidAt: paid_at,
      },
    });

    return updatedOrder;
  };
}
