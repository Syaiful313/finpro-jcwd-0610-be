import { injectable } from "tsyringe";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { PaginationService } from "../pagination/pagination.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { ApiError } from "../../utils/api-error";

@injectable()
export class WorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly paginationService: PaginationService,
    private readonly fileService: CloudinaryService,
  ) {}

  getWorkerOrders = async (authUserId: number) => {
    const worker = await this.prisma.employee.findFirstOrThrow({
      where: { id: authUserId },
      include: { user: true },
    });
    // ckec if worker clock in today
    const currentAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId: worker.id,
        clockInAt: { gt: new Date(new Date().setHours(0, 0, 0, 0)) },
        clockOutAt: null,
      },
    });
    if (!currentAttendance) {
      throw new ApiError("Worker is not clocked in", 400);
    }
  };
  processOrder = async (authUserId: number) => {
    const employee = await this.prisma.employee.findUnique({
      where: { id: authUserId },
    });
    if (!employee) {
      throw new ApiError("Employee not found", 404);
    }
  };
  completeOrder = async () => {};
  bypassRequest = async () => {};
}
