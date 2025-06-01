import { Role } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";

export interface CurrentUser {
  id: number;
  role: Role;
  outletId?: number;
}

@injectable()
export class AdminValidation {
  constructor(private readonly prisma: PrismaService) {}

  validateUserCreation = async (
    currentUser: CurrentUser,
    targetRole: Role,
    targetOutletId?: number,
  ): Promise<number | undefined> => {
    if (currentUser.role === "ADMIN") {
      if (targetRole === "ADMIN") {
        throw new ApiError("Admin tidak bisa membuat akun admin lain", 403);
      }
      return targetOutletId;
    }

    if (currentUser.role === "OUTLET_ADMIN") {
      const allowedRoles: Role[] = ["OUTLET_ADMIN", "WORKER", "DRIVER"];

      if (!allowedRoles.includes(targetRole)) {
        throw new ApiError(
          "Outlet admin hanya bisa membuat akun OUTLET_ADMIN, WORKER, atau DRIVER",
          403,
        );
      }

      const employeeData = await this.prisma.employee.findFirst({
        where: { userId: currentUser.id },
        select: { outletId: true },
      });

      if (!employeeData) {
        throw new ApiError("Data employee outlet admin tidak ditemukan", 400);
      }

      if (targetOutletId && targetOutletId !== employeeData.outletId) {
        throw new ApiError(
          "Outlet admin hanya bisa membuat user untuk outlet sendiri",
          403,
        );
      }

      return employeeData.outletId;
    }

    throw new ApiError("Permission tidak cukup untuk membuat user", 403);
  };

  validateUserDeletion = async (
    currentUser: CurrentUser,
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
        throw new ApiError("Data outlet admin tidak ditemukan", 400);
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
        throw new ApiError("User tidak ditemukan", 404);
      }

      const targetUserOutlets = targetUser.employees.map((emp) => emp.outletId);
      if (!targetUserOutlets.includes(currentUserEmployee.outletId)) {
        throw new ApiError(
          "Anda hanya bisa menghapus user dari outlet sendiri",
          403,
        );
      }

      if (targetUser.role === "ADMIN" || targetUser.role === "OUTLET_ADMIN") {
        throw new ApiError("Anda tidak bisa menghapus user admin", 403);
      }

      return;
    }

    throw new ApiError("Permission tidak cukup untuk menghapus user", 403);
  };

  validateUserUpdate = async (
    currentUser: CurrentUser,
    targetUserId: number,
    newRole?: string,
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
        throw new ApiError("Data outlet admin tidak ditemukan", 400);
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
        throw new ApiError("User tidak ditemukan", 404);
      }

      const targetUserOutlets = targetUser.employees.map((emp) => emp.outletId);
      if (!targetUserOutlets.includes(currentUserEmployee.outletId)) {
        throw new ApiError(
          "Anda hanya bisa mengupdate user dari outlet sendiri",
          403,
        );
      }

      if (targetUser.role === "ADMIN" || targetUser.role === "OUTLET_ADMIN") {
        throw new ApiError("Anda tidak bisa mengupdate user admin", 403);
      }

      if (newRole && (newRole === "ADMIN" || newRole === "OUTLET_ADMIN")) {
        throw new ApiError("Anda tidak bisa mengubah role ke admin", 403);
      }

      if (newRole && !["WORKER", "DRIVER"].includes(newRole)) {
        throw new ApiError(
          "Anda hanya bisa set role ke WORKER atau DRIVER",
          403,
        );
      }

      return;
    }

    throw new ApiError("Permission tidak cukup untuk mengupdate user", 403);
  };

  validateUserData = async (data: {
    email: string;
    phoneNumber: string;
    role: Role;
    profile?: Express.Multer.File;
    npwp?: string;
    targetOutletId?: number;
  }): Promise<void> => {
    const { email, phoneNumber, role, profile, npwp, targetOutletId } = data;

    const existingUser = await this.prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      throw new ApiError("User dengan email ini sudah ada", 400);
    }

    const existingPhone = await this.prisma.user.findFirst({
      where: { phoneNumber },
    });

    if (existingPhone) {
      throw new ApiError("User dengan nomor telepon ini sudah ada", 400);
    }

    const rolesRequiringProfile: Role[] = ["OUTLET_ADMIN", "WORKER", "DRIVER"];
    if (rolesRequiringProfile.includes(role) && !profile) {
      throw new ApiError(`Profile picture wajib untuk role ${role}`, 400);
    }

    const employeeRoles: Role[] = ["OUTLET_ADMIN", "WORKER", "DRIVER"];
    if (employeeRoles.includes(role)) {
      if (!targetOutletId) {
        throw new ApiError(`Outlet ID wajib untuk role ${role}`, 400);
      }

      if (!npwp) {
        throw new ApiError(`NPWP wajib untuk role ${role}`, 400);
      }
    }
  };

  validateUserUpdateData = async (data: {
    userId: number;
    email?: string;
    phoneNumber?: string;
    role?: string;
    npwp?: string;
    outletId?: string;
    existingUser: any;
  }): Promise<void> => {
    const { userId, email, phoneNumber, role, npwp, outletId, existingUser } =
      data;

    if (email && email !== existingUser.email) {
      const emailExists = await this.prisma.user.findFirst({
        where: {
          email,
          id: { not: userId },
          deletedAt: null,
        },
      });

      if (emailExists) {
        throw new ApiError("Email sudah digunakan", 400);
      }
    }

    if (phoneNumber && phoneNumber !== existingUser.phoneNumber) {
      const phoneExists = await this.prisma.user.findFirst({
        where: {
          phoneNumber: phoneNumber,
          id: { not: userId },
          deletedAt: null,
        },
      });

      if (phoneExists) {
        throw new ApiError("Nomor telepon sudah digunakan", 400);
      }
    }

    const newRoleRequiresEmployeeData =
      role && ["OUTLET_ADMIN", "WORKER", "DRIVER"].includes(role);

    if (newRoleRequiresEmployeeData) {
      if (!npwp) {
        throw new ApiError(`NPWP wajib untuk role ${role}`, 400);
      }

      if (!outletId) {
        throw new ApiError(`Outlet wajib untuk role ${role}`, 400);
      }
    }
  };

  validateOutlet = async (outletId: number): Promise<void> => {
    if (isNaN(outletId) || outletId <= 0) {
      throw new Error("Outlet ID tidak valid");
    }

    const outletExists = await this.prisma.outlet.findUnique({
      where: { id: outletId },
      select: { id: true, isActive: true },
    });

    if (!outletExists) {
      throw new Error("Outlet tidak ditemukan");
    }

    if (!outletExists.isActive) {
      throw new Error("Outlet tidak aktif");
    }
  };

  validateUserExists = async (userId: number): Promise<any> => {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        employees: {
          select: { id: true, outletId: true, npwp: true },
        },
      },
    });

    if (!user) {
      throw new ApiError("User tidak ditemukan", 404);
    }

    if (user.deletedAt) {
      throw new ApiError("User sudah dihapus", 400);
    }

    return user;
  };

  validateNotSelfDeletion = (
    currentUserId: number,
    targetUserId: number,
  ): void => {
    if (currentUserId === targetUserId) {
      throw new ApiError("Anda tidak bisa menghapus akun sendiri", 400);
    }
  };
}
