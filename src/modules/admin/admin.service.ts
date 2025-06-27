import { Prisma, Role } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { AdminValidation } from "./admin.validation";
import { CreateUserDTO } from "./dto/create-user.dto";
import { GetUsersDTO } from "./dto/get-users.dto";
import { UpdateUserDTO } from "./dto/update-user.dto";
import { PasswordService } from "./password.service";

@injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly fileService: CloudinaryService,
    private readonly passwordService: PasswordService,
    private readonly adminValidation: AdminValidation,
  ) {}

  getUsers = async (query: GetUsersDTO, outletId?: number) => {
    const { page, take, sortBy, sortOrder, search, role, all } = query;

    if (outletId !== undefined) {
      await this.adminValidation.validateOutlet(outletId);
    }

    const conditions: Prisma.UserWhereInput[] = [];
    conditions.push({ deletedAt: null });

    if (outletId) {
      let allowedRoles: Role[] = [Role.DRIVER, Role.WORKER, Role.OUTLET_ADMIN];

      if (role && allowedRoles.includes(role)) {
        allowedRoles = [role];
      }

      const roleConditions = [];
      const employeeRoles = allowedRoles.filter(
        (r) => r === Role.DRIVER || r === Role.WORKER,
      );

      if (employeeRoles.length > 0) {
        roleConditions.push({
          AND: [
            { role: { in: employeeRoles } },
            { employees: { some: { outletId: outletId, deletedAt: null } } },
          ],
        });
      }

      if (allowedRoles.includes(Role.OUTLET_ADMIN)) {
        roleConditions.push({
          AND: [{ role: Role.OUTLET_ADMIN }, { outletId: outletId }],
        });
      }

      if (roleConditions.length > 0) {
        conditions.push({ OR: roleConditions });
      }
    }

    if (search) {
      conditions.push({
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      });
    }

    if (role && !outletId) {
      conditions.push({ role });
    }

    const whereClause: Prisma.UserWhereInput = { AND: conditions };

    const baseSelect = {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      phoneNumber: true,
      profilePic: true,
      isVerified: true,
      provider: true,
      outletId: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    };

    const selectFields = outletId
      ? {
          ...baseSelect,
          _count: {
            select: {
              orders: {
                where: {
                  outletId: outletId,
                },
              },
            },
          },
          employees: {
            where: {
              outletId: outletId,
              deletedAt: null,
            },
            select: {
              id: true,
              npwp: true,
              outletId: true,
              createdAt: true,
              outlet: {
                select: {
                  id: true,
                  outletName: true,
                  address: true,
                },
              },
            },
          },
          outlet: {
            select: {
              id: true,
              outletName: true,
              address: true,
            },
          },
        }
      : {
          ...baseSelect,
          employees: {
            where: {
              deletedAt: null,
            },
            select: {
              id: true,
              npwp: true,
              outletId: true,
              createdAt: true,
              outlet: {
                select: {
                  id: true,
                  outletName: true,
                  address: true,
                },
              },
            },
          },
          outlet: {
            select: {
              id: true,
              outletName: true,
              address: true,
            },
          },
        };

    let paginationArgs: Prisma.UserFindManyArgs = {};
    if (!all) {
      paginationArgs = {
        skip: (page - 1) * take,
        take,
      };
    }

    const users = await this.prisma.user.findMany({
      where: whereClause,
      orderBy: { [sortBy]: sortOrder },
      select: selectFields,
      ...paginationArgs,
    });

    const transformedUsers = users.map((user) => {
      const baseTransformed = {
        ...user,
        phoneNumber: user.phoneNumber ? user.phoneNumber.toString() : null,
      };

      const employeeInfo =
        (user as any).employees?.length > 0 ? (user as any).employees[0] : null;

      if (outletId) {
        const shouldIncludeOrderCount =
          user.role === Role.DRIVER || user.role === Role.WORKER;

        return {
          ...baseTransformed,
          ...(shouldIncludeOrderCount && {
            totalOrdersInOutlet: (user as any)._count?.orders || 0,
          }),
          employeeInfo,
          _count: undefined,
          employees: undefined,
        };
      }

      return {
        ...baseTransformed,
        employeeInfo,
        employees: undefined,
      };
    });

    const count = await this.prisma.user.count({ where: whereClause });

    return {
      data: transformedUsers,
      meta: this.paginationService.generateMeta({
        page,
        take: all ? count : take,
        count,
      }),
    };
  };

  createUser = async (body: CreateUserDTO, profile: Express.Multer.File) => {
    const {
      firstName,
      lastName,
      email,
      password,
      role,
      phoneNumber,
      isVerified,
      provider,
      outletId,
      npwp,
    } = body;

    if (!role) {
      throw new ApiError("Role wajib diisi", 400);
    }

    if (!Object.values(Role).includes(role as Role)) {
      throw new ApiError("Role tidak valid", 400);
    }

    const targetOutletId = outletId;
    const isEmployeeRole = this.isEmployeeRole(role as Role);

    if (isEmployeeRole) {
      if (!targetOutletId) {
        throw new ApiError("Outlet ID wajib untuk role employee", 400);
      }
      if (!npwp) {
        throw new ApiError("NPWP wajib untuk role employee", 400);
      }
    }

    await this.adminValidation.validateUserData({
      email,
      phoneNumber,
      role,
      profile,
      npwp,
      targetOutletId,
    });

    const isVerifiedBool =
      typeof isVerified === "string"
        ? isVerified === "true"
        : Boolean(isVerified);

    let profilePicUrl = null;
    if (profile) {
      const { secure_url } = await this.fileService.upload(profile);
      profilePicUrl = secure_url;
    }

    const hashedPassword = await this.passwordService.hashPassword(password);

    const result = await this.prisma.$transaction(async (tx) => {
      const userData = {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        phoneNumber,
        profilePic: profilePicUrl,
        isVerified: isVerifiedBool,
        provider: provider || "CREDENTIAL",
        role: role as Role,

        ...(role === Role.OUTLET_ADMIN && targetOutletId
          ? { outletId: targetOutletId }
          : {}),
      };

      const newUser = await tx.user.create({ data: userData });

      if (isEmployeeRole && targetOutletId) {
        await tx.employee.create({
          data: {
            userId: newUser.id,
            outletId: targetOutletId,
            npwp: npwp!,
          },
        });
      }

      return newUser;
    });

    return {
      success: true,
      message: "User berhasil dibuat",
      data: { ...result, password: undefined },
    };
  };

  updateUser = async (
    userId: number,
    body: UpdateUserDTO,
    profile: Express.Multer.File | undefined,
  ) => {
    const {
      firstName,
      lastName,
      email,
      password,
      role,
      phoneNumber,
      isVerified,
      provider,
      outletId,
      npwp,
    } = body;

    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        employees: {
          where: { deletedAt: null },
          include: { outlet: true },
        },
        outlet: true,
      },
    });

    if (!existingUser) {
      throw new ApiError("User tidak ditemukan", 404);
    }

    await this.adminValidation.validateUserUpdateData({
      userId,
      email,
      phoneNumber,
      role,
      npwp,
      outletId,
      existingUser,
    });

    const isVerifiedBool =
      isVerified !== undefined
        ? typeof isVerified === "string"
          ? isVerified === "true"
          : Boolean(isVerified)
        : undefined;

    let profilePicUrl: string | undefined;
    if (profile) {
      const { secure_url } = await this.fileService.upload(profile);
      profilePicUrl = secure_url;
    }

    let hashedPassword: string | undefined;
    if (password) {
      hashedPassword = await this.passwordService.hashPassword(password);
    }

    const currentRole = existingUser.role;
    const newRole = role ? (role as Role) : currentRole;
    const roleChanged = role && role !== currentRole;

    const currentIsEmployee = this.isEmployeeRole(currentRole);
    const newIsEmployee = this.isEmployeeRole(newRole);

    if (newIsEmployee) {
      if (roleChanged && !outletId) {
        throw new ApiError("Outlet ID wajib untuk role employee", 400);
      }

      if (roleChanged && !currentIsEmployee && !npwp) {
        throw new ApiError("NPWP wajib untuk role employee baru", 400);
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updateData: any = {};

      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) updateData.email = email;
      if (hashedPassword !== undefined) updateData.password = hashedPassword;
      if (role !== undefined) updateData.role = role;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      if (profilePicUrl !== undefined) updateData.profilePic = profilePicUrl;
      if (isVerifiedBool !== undefined) updateData.isVerified = isVerifiedBool;
      if (provider !== undefined) updateData.provider = provider;

      if (roleChanged) {
        if (newRole === Role.OUTLET_ADMIN) {
          updateData.outletId = outletId ? Number(outletId) : null;
        } else {
          updateData.outletId = null;
        }
      } else if (currentRole === Role.OUTLET_ADMIN && outletId !== undefined) {
        updateData.outletId = outletId ? Number(outletId) : null;
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: updateData,
      });

      if (roleChanged) {
        if (currentIsEmployee && !newIsEmployee) {
          await tx.employee.updateMany({
            where: { userId: userId, deletedAt: null },
            data: { deletedAt: new Date() },
          });
        } else if (!currentIsEmployee && newIsEmployee) {
          const targetOutletId = Number(outletId);
          await tx.employee.create({
            data: {
              userId: userId,
              outletId: targetOutletId,
              npwp: npwp || "",
            },
          });
        } else if (currentIsEmployee && newIsEmployee) {
          const targetOutletId = outletId ? Number(outletId) : undefined;
          if (targetOutletId) {
            const updateEmployeeData: any = { outletId: targetOutletId };
            if (npwp !== undefined) updateEmployeeData.npwp = npwp;
          }
        }
      } else if (currentIsEmployee) {
        const updateEmployeeData: any = {};
        let shouldUpdateEmployee = false;

        if (outletId !== undefined) {
          const targetOutletId = Number(outletId);

          const currentEmployeeOutlet = existingUser.employees[0]?.outletId;

          if (currentEmployeeOutlet !== targetOutletId) {
            updateEmployeeData.outletId = targetOutletId;
            shouldUpdateEmployee = true;
          }
        }

        if (npwp !== undefined) {
          const currentNpwp = existingUser.employees[0]?.npwp;
          if (currentNpwp !== npwp) {
            updateEmployeeData.npwp = npwp;
            shouldUpdateEmployee = true;
          }
        }

        if (shouldUpdateEmployee) {
          const updateResult = await tx.employee.updateMany({
            where: { userId: userId, deletedAt: null },
            data: updateEmployeeData,
          });

          if (updateResult.count === 0) {
            await tx.employee.create({
              data: {
                userId: userId,
                outletId: Number(outletId),
                npwp: npwp || "",
              },
            });
          }
        }
      }

      return updatedUser;
    });

    const userWithCompleteInfo = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        phoneNumber: true,
        profilePic: true,
        isVerified: true,
        provider: true,
        outletId: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        outlet: {
          select: {
            id: true,
            outletName: true,
            address: true,
          },
        },
        employees: {
          where: { deletedAt: null },
          select: {
            id: true,
            npwp: true,
            outletId: true,
            createdAt: true,
            outlet: {
              select: {
                id: true,
                outletName: true,
                address: true,
              },
            },
          },
        },
      },
    });

    const transformedUser = {
      ...userWithCompleteInfo,
      phoneNumber: userWithCompleteInfo?.phoneNumber?.toString(),
      password: undefined,

      employeeInfo: userWithCompleteInfo?.employees?.[0] || null,
    };

    return {
      success: true,
      message: "User berhasil diupdate",
      data: transformedUser,
    };
  };

  deleteUser = async (userId: number) => {
    const result = await this.prisma.$transaction(async (tx) => {
      const deletedUser = await tx.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });

      await tx.employee.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      return deletedUser;
    });

    return {
      success: true,
      message: "User berhasil dihapus",
      data: {
        id: result.id,
        name: `${result.firstName} ${result.lastName}`,
        email: result.email,
        deletedAt: result.deletedAt,
      },
    };
  };

  private isEmployeeRole(role: Role): boolean {
    return (
      role === Role.OUTLET_ADMIN || role === Role.WORKER || role === Role.DRIVER
    );
  }

  private isEmployeeRoleString(role: string): boolean {
    return role === "OUTLET_ADMIN" || role === "WORKER" || role === "DRIVER";
  }
}
