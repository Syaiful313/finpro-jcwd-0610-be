import { Role } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { GetEmployeesDTO } from "./dto/get-employees.dto";

export interface CurrentUser {
  id: number;
  role: Role;
  outletId?: number;
}

@injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  getEmployees = async (query: GetEmployeesDTO, currentUser: CurrentUser) => {
    const {
      page = 1,
      take = 10,
      sortBy = "user.firstName",
      sortOrder = "asc",
      outletId,
      all,
    } = query;

    const where: any = {
      user: {
        deletedAt: null,
        role: {
          in: [Role.OUTLET_ADMIN, Role.WORKER, Role.DRIVER],
        },
      },
    };

    if (currentUser.role === Role.ADMIN) {
      if (outletId) {
        await this.validateOutlet(parseInt(outletId));
        where.outletId = parseInt(outletId);
      }
    } else if (currentUser.role === Role.OUTLET_ADMIN) {
      const userOutlet = await this.getUserOutlet(currentUser.id);
      where.outletId = userOutlet.outletId;

      if (outletId && parseInt(outletId) !== userOutlet.outletId) {
        throw new ApiError(
          "Outlet admin hanya bisa melihat karyawan dari outlet sendiri",
          403,
        );
      }
    } else {
      throw new ApiError("Permission tidak cukup", 403);
    }

    const includeRelations = {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
      outlet: {
        select: {
          id: true,
          outletName: true,
        },
      },
    };

    let paginationArgs: any = {};

    if (!all) {
      paginationArgs = {
        skip: (page - 1) * take,
        take,
      };
    }

    let orderByClause: any;
    if (sortBy.startsWith("user.")) {
      const userField = sortBy.replace("user.", "");
      orderByClause = {
        user: {
          [userField]: sortOrder,
        },
      };
    } else {
      orderByClause = { [sortBy]: sortOrder };
    }

    const [employees, count] = (await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: includeRelations,
        orderBy: orderByClause,
        ...paginationArgs,
      }),
      this.prisma.employee.count({ where }),
    ])) as [any[], number];

    const transformedEmployees = employees.map((employee: any) => ({
      id: employee.id,
      npwp: employee.npwp,
      role: employee.user.role,
      user: {
        id: employee.user.id,
        firstName: employee.user.firstName,
        lastName: employee.user.lastName,
        email: employee.user.email,
      },
      outlet: employee.outlet,
    }));

    return {
      data: transformedEmployees,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };

  private async validateOutlet(outletId: number): Promise<void> {
    if (isNaN(outletId) || outletId <= 0) {
      throw new ApiError("Outlet ID tidak valid", 400);
    }

    const outlet = await this.prisma.outlet.findUnique({
      where: { id: outletId },
      select: { id: true },
    });

    if (!outlet) {
      throw new ApiError("Outlet tidak ditemukan", 404);
    }
  }

  private async getUserOutlet(userId: number): Promise<{ outletId: number }> {
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
      select: { outletId: true },
    });

    if (!employee) {
      throw new ApiError("Data employee tidak ditemukan", 400);
    }

    return employee;
  }
}
