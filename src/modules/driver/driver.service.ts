import { injectable } from "tsyringe";
import { PrismaService } from "../prisma/prisma.service";
import { PaginationService } from "../pagination/pagination.service";

@injectable()
export class DriverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}
}
