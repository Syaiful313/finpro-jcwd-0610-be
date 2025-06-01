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
  cloudinaryService: any;
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly fileService: CloudinaryService,
    private passwordService: PasswordService,
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

      if (
        role &&
        ([Role.DRIVER, Role.WORKER, Role.OUTLET_ADMIN] as Role[]).includes(
          role as Role,
        )
      ) {
        allowedRoles = [role as Role];
      }

      const roleConditions = [];

      const employeeRoles = allowedRoles.filter(
        (r) => r === Role.DRIVER || r === Role.WORKER,
      );

      if (employeeRoles.length > 0) {
        roleConditions.push({
          AND: [
            {
              role: {
                in: employeeRoles,
              },
            },
            {
              employees: {
                some: {
                  outletId: outletId,
                },
              },
            },
          ],
        });
      }

      if (allowedRoles.includes(Role.OUTLET_ADMIN)) {
        roleConditions.push({
          AND: [{ role: Role.OUTLET_ADMIN }, { outletId: outletId }],
        });
      }

      if (roleConditions.length > 0) {
        conditions.push({
          OR: roleConditions,
        });
      }
    }

    if (search) {
      conditions.push({
        OR: [
          {
            firstName: {
              contains: search,
              mode: "insensitive" as const,
            },
          },
          {
            lastName: {
              contains: search,
              mode: "insensitive" as const,
            },
          },
          {
            email: {
              contains: search,
              mode: "insensitive" as const,
            },
          },
        ],
      });
    }

    if (role && !outletId) {
      conditions.push({ role });
    }

    const whereClause: Prisma.UserWhereInput = {
      AND: conditions,
    };

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
            },
            select: {
              id: true,
              npwp: true,
              outletId: true,
              createdAt: true,
            },
          },
        }
      : {
          ...baseSelect,

          employees: {
            select: {
              id: true,
              npwp: true,
              outletId: true,
              createdAt: true,
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

    const parsedOutletId = outletId ? parseInt(outletId.toString()) : undefined;

    await this.adminValidation.validateUserData({
      email,
      phoneNumber,
      role,
      profile,
      npwp,
      targetOutletId: parsedOutletId,
    });

    const isVerifiedBool =
      typeof isVerified === "string" ? isVerified === "true" : isVerified;

    let profilePicUrl = null;
    if (profile) {
      const { secure_url } = await this.fileService.upload(profile);
      profilePicUrl = secure_url;
    }

    const hashedPassword = await this.passwordService.hassPassword(password);

    const result = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          firstName,
          lastName,
          email,
          password: hashedPassword,
          phoneNumber,
          profilePic: profilePicUrl,
          isVerified: isVerifiedBool,
          provider: provider || "CREDENTIAL",
          role: role,

          ...(parsedOutletId &&
          ["OUTLET_ADMIN", "WORKER", "DRIVER"].includes(role)
            ? { outletId: parsedOutletId }
            : {}),
        },
      });

      const employeeRoles: Role[] = ["OUTLET_ADMIN", "WORKER", "DRIVER"];
      if (employeeRoles.includes(role)) {
        await tx.employee.create({
          data: {
            userId: newUser.id,
            outletId: parsedOutletId!,
            npwp: npwp!,
          },
        });
      }

      return newUser;
    });

    return {
      success: true,
      message: "User berhasil dibuat",
      data: {
        ...result,
        password: undefined,
      },
    };
  };

  deleteUser = async (userId: number) => {
    const result = await this.prisma.$transaction(async (tx) => {
      const deletedUser = await tx.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });

      await tx.employee.updateMany({
        where: {
          userId: userId,
          deletedAt: null,
        },
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

    const existingUser = await this.adminValidation.validateUserExists(userId);

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
          : isVerified
        : undefined;

    let profilePicUrl: string | undefined;
    if (profile) {
      const { secure_url } = await this.fileService.upload(profile);
      profilePicUrl = secure_url;
    }

    let hashedPassword: string | undefined;
    if (password) {
      hashedPassword = await this.passwordService.hassPassword(password);
    }

    const newRoleRequiresEmployeeData =
      role && ["OUTLET_ADMIN", "WORKER", "DRIVER"].includes(role);
    const currentRoleRequiresEmployeeData = [
      "OUTLET_ADMIN",
      "WORKER",
      "DRIVER",
    ].includes(existingUser.role);

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

      if (newRoleRequiresEmployeeData) {
        updateData.outletId = outletId ? Number(outletId) : null;
      } else {
        updateData.outletId = null;
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: updateData,
      });

      if (newRoleRequiresEmployeeData) {
        const targetOutletId = outletId ? Number(outletId) : undefined;

        if (!targetOutletId) {
          throw new ApiError("Outlet ID wajib untuk role employee", 400);
        }

        if (existingUser.employees.length > 0) {
          await tx.employee.updateMany({
            where: { userId: userId },
            data: {
              outletId: targetOutletId,
              ...(npwp && { npwp: npwp }),
            },
          });
        } else {
          await tx.employee.create({
            data: {
              userId: userId,
              outletId: targetOutletId,
              npwp: npwp || "",
            },
          });
        }
      } else if (
        currentRoleRequiresEmployeeData &&
        !newRoleRequiresEmployeeData
      ) {
        await tx.employee.deleteMany({
          where: { userId: userId },
        });
      }

      return updatedUser;
    });

    return {
      success: true,
      message: "User berhasil diupdate",
      data: {
        ...result,
        phoneNumber: result.phoneNumber?.toString(),
        password: undefined,
      },
    };
  };
}
