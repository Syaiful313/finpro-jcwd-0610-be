// lib/xendit.ts
import { Xendit } from 'xendit-node';
import { InvoiceApi } from 'xendit-node/invoice/apis';

class XenditService {
  private invoice: InvoiceApi;

  constructor() {
    const xendit = new Xendit({
      secretKey: process.env.XENDIT_SECRET_KEY!,
    });

    this.invoice = xendit.Invoice;
  }

  getInvoiceAPI() {
    return this.invoice;
  }

  async createInvoice(params: {
    externalId: string;
    amount: number;
    email: string;
    successRedirectUrl?: string;
  }) {
    console.log("XENDIT SECRET",process.env.XENDIT_SECRET_KEY!)
    const { externalId, amount, email, successRedirectUrl } = params;

    return this.invoice.createInvoice({
      data: {
        externalId,
        currency: 'IDR',
        amount,
        customer: {
          email,
        },
        successRedirectUrl,
      },
    });
  }
}

const xenditService = new XenditService();

export default xenditService;