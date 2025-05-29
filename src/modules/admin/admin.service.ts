import { Prisma, Role } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { GetUsersDTO } from "../admin-super/dto/get-users.dto";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDTO } from "./dto/create-user.dto";
import { PasswordService } from "./password.service";
import { UpdateUserDTO } from "./dto/update-user.dto";

@injectable()
export class AdminService {
  cloudinaryService: any;
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly fileService: CloudinaryService,
    private passwordService: PasswordService,
  ) {}

  getUsers = async (query: GetUsersDTO, outletId?: number) => {
    const { page, take, sortBy, sortOrder, search, role, all } = query;

    if (outletId !== undefined) {
      if (isNaN(outletId) || outletId <= 0) {
        throw new Error("Invalid outlet ID");
      }

      const outletExists = await this.prisma.outlet.findUnique({
        where: { id: outletId },
        select: { id: true, isActive: true },
      });

      if (!outletExists) {
        throw new Error("Outlet not found");
      }

      if (!outletExists.isActive) {
        throw new Error("Outlet is not active");
      }
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
              createdAt: true,
            },
          },
        }
      : baseSelect;

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

      if (outletId) {
        const shouldIncludeOrderCount =
          user.role === Role.DRIVER || user.role === Role.WORKER;

        return {
          ...baseTransformed,
          ...(shouldIncludeOrderCount && {
            totalOrdersInOutlet: (user as any)._count?.orders || 0,
          }),
          employeeInfo:
            (user as any).employees?.length > 0
              ? (user as any).employees[0]
              : null,
          _count: undefined,
          employees: undefined,
        };
      }

      return baseTransformed;
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

  private validateUserCreationPermission = async (
    currentUser: { id: number; role: Role; outletId?: number },
    targetRole: Role,
    targetOutletId?: number,
  ): Promise<number | undefined> => {
    if (currentUser.role === "ADMIN") {
      return targetOutletId;
    }

    if (currentUser.role === "OUTLET_ADMIN") {
      if (targetRole !== "WORKER" && targetRole !== "DRIVER") {
        throw new ApiError(
          "Outlet admin can only create WORKER or DRIVER accounts",
          403,
        );
      }

      const employeeData = await this.prisma.employee.findFirst({
        where: { userId: currentUser.id },
        select: { outletId: true },
      });

      if (!employeeData) {
        throw new ApiError("Outlet admin data not found", 400);
      }

      if (targetOutletId && targetOutletId !== employeeData.outletId) {
        throw new ApiError(
          "Outlet admin can only create users for their own outlet",
          403,
        );
      }

      return employeeData.outletId;
    }

    throw new ApiError("Insufficient permissions to create user", 403);
  };

  createUser = async (
    body: CreateUserDTO,
    profile: Express.Multer.File,
    currentUser: { id: number; role: Role; outletId?: number },
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

    if (!role) {
      throw new ApiError("Role is required", 400);
    }

    if (role === "OUTLET_ADMIN" || role === "WORKER" || role === "DRIVER") {
      if (!profile) {
        throw new ApiError(`Profile picture is required for ${role} role`, 400);
      }
    }

    const targetOutletId = await this.validateUserCreationPermission(
      currentUser,
      role,
      outletId,
    );

    const existingUser = await this.prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      throw new ApiError("User already exists", 400);
    }

    const existingPhone = await this.prisma.user.findFirst({
      where: { phoneNumber: phoneNumber },
    });

    if (existingPhone) {
      throw new ApiError("User with this phone number already exists", 400);
    }

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
          phoneNumber: phoneNumber,
          profilePic: profilePicUrl,
          isVerified: isVerifiedBool,
          provider: provider || "CREDENTIAL",
          role: role || "CUSTOMER",
        },
      });

      if (role === "OUTLET_ADMIN" || role === "WORKER" || role === "DRIVER") {
        if (!targetOutletId) {
          throw new ApiError(`Outlet ID is required for ${role} role`, 400);
        }

        if (!npwp) {
          throw new ApiError(`NPWP is required for ${role} role`, 400);
        }

        await tx.employee.create({
          data: {
            userId: newUser.id,
            outletId: targetOutletId,
            npwp: npwp,
          },
        });
      }

      return newUser;
    });

    return {
      success: true,
      message: "User created successfully",
      data: {
        ...result,
        password: undefined,
      },
    };
  };

  private validateUserDeletionPermission = async (
    currentUser: { id: number; role: Role; outletId?: number },
    targetUserId: number,
  ): Promise<void> => {
    if (currentUser.role === "ADMIN") {
      return;
    }

    if (currentUser.role === "OUTLET_ADMIN") {
      const currentUserEmployee = await this.prisma.employee.findFirst({
        where: { userId: currentUser.id },
        select: { outletId: true },
      });

      if (!currentUserEmployee) {
        throw new ApiError("Outlet admin data not found", 400);
      }

      const targetUser = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          employees: {
            select: { outletId: true },
          },
        },
      });

      if (!targetUser) {
        throw new ApiError("User not found", 404);
      }

      const targetUserOutlets = targetUser.employees.map((emp) => emp.outletId);

      if (!targetUserOutlets.includes(currentUserEmployee.outletId)) {
        throw new ApiError(
          "You can only delete users from your own outlet",
          403,
        );
      }

      if (targetUser.role === "ADMIN" || targetUser.role === "OUTLET_ADMIN") {
        throw new ApiError("You cannot delete admin users", 403);
      }

      return;
    }

    throw new ApiError("Insufficient permissions to delete user", 403);
  };

  deleteUser = async (
    userId: number,
    currentUser: { id: number; role: Role; outletId?: number },
  ) => {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ApiError("User not found", 404);
    }

    if (user.deletedAt) {
      throw new ApiError("User already deleted", 400);
    }

    if (currentUser.id === userId) {
      throw new ApiError("You cannot delete your own account", 400);
    }

    await this.validateUserDeletionPermission(currentUser, userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const deletedUser = await tx.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });

      await tx.employee.deleteMany({
        where: { userId: userId },
      });

      return deletedUser;
    });

    return {
      success: true,
      message: "User deleted successfully",
      data: {
        id: result.id,
        name: `${result.firstName} ${result.lastName}`,
        email: result.email,
        deletedAt: result.deletedAt,
      },
    };
  };

 // ✅ UPDATED: Update User Service with Permission Check
private validateUserUpdatePermission = async (
  currentUser: { id: number; role: Role; outletId?: number },
  targetUserId: number,
  newRole?: string,
): Promise<void> => {
  // ADMIN dapat update semua user
  if (currentUser.role === "ADMIN") {
    return;
  }

  // OUTLET_ADMIN hanya bisa update user di outlet mereka
  if (currentUser.role === "OUTLET_ADMIN") {
    // Get current user's outlet from employee data
    const currentUserEmployee = await this.prisma.employee.findFirst({
      where: { userId: currentUser.id },
      select: { outletId: true },
    });

    if (!currentUserEmployee) {
      throw new ApiError("Outlet admin data not found", 400);
    }

    // Get target user data
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        employees: {
          select: { outletId: true },
        },
      },
    });

    if (!targetUser) {
      throw new ApiError("User not found", 404);
    }

    // Check if target user is in the same outlet
    const targetUserOutlets = targetUser.employees.map(emp => emp.outletId);
    
    if (!targetUserOutlets.includes(currentUserEmployee.outletId)) {
      throw new ApiError(
        "You can only update users from your own outlet",
        403,
      );
    }

    // OUTLET_ADMIN tidak bisa update ADMIN atau OUTLET_ADMIN lain
    if (targetUser.role === "ADMIN" || targetUser.role === "OUTLET_ADMIN") {
      throw new ApiError("You cannot update admin users", 403);
    }

    // OUTLET_ADMIN tidak bisa change role ke ADMIN atau OUTLET_ADMIN
    if (newRole && (newRole === "ADMIN" || newRole === "OUTLET_ADMIN")) {
      throw new ApiError("You cannot change user role to admin", 403);
    }

    // OUTLET_ADMIN hanya bisa set role ke WORKER atau DRIVER
    if (newRole && !["WORKER", "DRIVER"].includes(newRole)) {
      throw new ApiError("You can only set role to WORKER or DRIVER", 403);
    }

    return;
  }

  throw new ApiError("Insufficient permissions to update user", 403);
};

updateUser = async (
  userId: number,
  body: UpdateUserDTO,
  profile: Express.Multer.File | undefined,
  currentUser: { id: number; role: Role; outletId?: number },
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

  // Check if user exists and not deleted
  const existingUser = await this.prisma.user.findUnique({
    where: { id: userId },
    include: {
      employees: {
        select: { id: true, outletId: true, npwp: true },
      },
    },
  });

  if (!existingUser) {
    throw new ApiError("User not found", 404);
  }

  if (existingUser.deletedAt) {
    throw new ApiError("Cannot update deleted user", 400);
  }

  // Validate update permissions
  await this.validateUserUpdatePermission(currentUser, userId, role);

  // Validate email uniqueness
  if (email && email !== existingUser.email) {
    const emailExists = await this.prisma.user.findFirst({
      where: {
        email,
        id: { not: userId },
        deletedAt: null,
      },
    });

    if (emailExists) {
      throw new ApiError("Email already exists", 400);
    }
  }

  // Validate phone number uniqueness
  if (phoneNumber && phoneNumber !== existingUser.phoneNumber) {
    const phoneExists = await this.prisma.user.findFirst({
      where: {
        phoneNumber: phoneNumber,
        id: { not: userId },
        deletedAt: null,
      },
    });

    if (phoneExists) {
      throw new ApiError("User with this phone number already exists", 400);
    }
  }

  // Handle boolean conversion
  const isVerifiedBool =
    isVerified !== undefined
      ? typeof isVerified === "string"
        ? isVerified === "true"
        : isVerified
      : undefined;

  // Handle profile picture upload
  let profilePicUrl: string | undefined;
  if (profile) {
    const { secure_url } = await this.fileService.upload(profile);
    profilePicUrl = secure_url;
  }

  // Hash password if provided
  let hashedPassword: string | undefined;
  if (password) {
    hashedPassword = await this.passwordService.hassPassword(password);
  }

  // Check if role requires employee data
  const newRoleRequiresEmployeeData = role && ["OUTLET_ADMIN", "WORKER", "DRIVER"].includes(role);
  const currentRoleRequiresEmployeeData = ["OUTLET_ADMIN", "WORKER", "DRIVER"].includes(existingUser.role);

  // Validate employee data for roles that require it
  if (newRoleRequiresEmployeeData) {
    // NPWP always required for employee roles
    if (!npwp) {
      throw new ApiError(`NPWP is required for ${role} role`, 400);
    }
    
    // outletId validation based on current user role
    if (currentUser.role === "ADMIN" && !outletId) {
      throw new ApiError(`Outlet is required for ${role} role`, 400);
    }
    // For OUTLET_ADMIN, outletId will be auto-determined from their employee data
  }

  // Perform update in transaction
  const result = await this.prisma.$transaction(async (tx) => {
    // Prepare user update data
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

    // Update user
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Handle employee data changes
    if (newRoleRequiresEmployeeData) {
      // Determine outletId
      let targetOutletId: number | undefined = outletId ? Number(outletId) : undefined;
      
      if (currentUser.role === "OUTLET_ADMIN") {
        const currentUserEmployee = await tx.employee.findFirst({
          where: { userId: currentUser.id },
          select: { outletId: true },
        });
        targetOutletId = currentUserEmployee?.outletId; // ✅ Already number from DB
      }

      if (!targetOutletId) {
        throw new ApiError("Outlet ID is required for employee roles", 400);
      }

      if (existingUser.employees.length > 0) {
        // Update existing employee record
        await tx.employee.updateMany({
          where: { userId: userId },
          data: {
            outletId: targetOutletId, // ✅ Now properly typed as number
            ...(npwp && { npwp: npwp }),
          },
        });
      } else {
        // Create new employee record
        await tx.employee.create({
          data: {
            userId: userId,
            outletId: targetOutletId, // ✅ Now properly typed as number
            npwp: npwp || "",
          },
        });
      }
    } else if (currentRoleRequiresEmployeeData && !newRoleRequiresEmployeeData) {
      // Role changed from employee to non-employee, delete employee records
      await tx.employee.deleteMany({
        where: { userId: userId },
      });
    }

    return updatedUser;
  });

  return {
    success: true,
    message: "User updated successfully",
    data: {
      ...result,
      phoneNumber: result.phoneNumber?.toString(),
      password: undefined, // Don't return password
    },
  };
};
}
