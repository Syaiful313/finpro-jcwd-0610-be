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
    if (currentUser.role === Role.ADMIN) {
      if (targetRole === Role.ADMIN) {
        throw new ApiError("Admin tidak bisa membuat akun admin lain", 403);
      }
      return targetOutletId;
    }

    if (currentUser.role === Role.OUTLET_ADMIN) {
      const allowedRoles: Role[] = [
        Role.OUTLET_ADMIN,
        Role.WORKER,
        Role.DRIVER,
      ];

      if (!allowedRoles.includes(targetRole)) {
        throw new ApiError(
          "Outlet admin hanya bisa membuat akun OUTLET_ADMIN, WORKER, atau DRIVER",
          403,
        );
      }

      const employeeData = await this.prisma.employee.findFirst({
        where: { userId: currentUser.id, deletedAt: null },
        select: { outletId: true },
      });

      if (!employeeData) {
        throw new ApiError("Data employee outlet admin tidak ditemukan", 404);
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
    if (currentUser.id === targetUserId) {
      throw new ApiError("Anda tidak bisa menghapus akun sendiri", 400);
    }

    if (currentUser.role === Role.ADMIN) {
      return;
    }

    if (currentUser.role === Role.OUTLET_ADMIN) {
      const currentUserEmployee = await this.prisma.employee.findFirst({
        where: { userId: currentUser.id, deletedAt: null },
        select: { outletId: true },
      });

      if (!currentUserEmployee) {
        throw new ApiError("Data outlet admin tidak ditemukan", 404);
      }

      const targetUser = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          employees: {
            where: { deletedAt: null },
            select: { outletId: true },
          },
        },
      });

      if (!targetUser || targetUser.deletedAt) {
        throw new ApiError("User tidak ditemukan", 404);
      }

      const targetUserOutlets = targetUser.employees.map((emp) => emp.outletId);
      if (!targetUserOutlets.includes(currentUserEmployee.outletId)) {
        throw new ApiError(
          "Anda hanya bisa menghapus user dari outlet sendiri",
          403,
        );
      }

      if (targetUser.role === Role.ADMIN) {
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
    if (
      currentUser.id === targetUserId &&
      newRole &&
      newRole !== currentUser.role
    ) {
      throw new ApiError("Anda tidak bisa mengubah role akun sendiri", 400);
    }

    if (currentUser.role === Role.ADMIN) {
      return;
    }

    if (currentUser.role === Role.OUTLET_ADMIN) {
      const currentUserEmployee = await this.prisma.employee.findFirst({
        where: { userId: currentUser.id, deletedAt: null },
        select: { outletId: true },
      });

      if (!currentUserEmployee) {
        throw new ApiError("Data outlet admin tidak ditemukan", 404);
      }

      const targetUser = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          employees: {
            where: { deletedAt: null },
            select: { outletId: true },
          },
        },
      });

      if (!targetUser || targetUser.deletedAt) {
        throw new ApiError("User tidak ditemukan", 404);
      }

      const targetUserOutlets = targetUser.employees.map((emp) => emp.outletId);
      if (!targetUserOutlets.includes(currentUserEmployee.outletId)) {
        throw new ApiError(
          "Anda hanya bisa mengupdate user dari outlet sendiri",
          403,
        );
      }

      if (targetUser.role === Role.ADMIN) {
        throw new ApiError("Anda tidak bisa mengupdate user admin", 403);
      }

      if (newRole && (newRole === "ADMIN" || newRole === "OUTLET_ADMIN")) {
        throw new ApiError("Anda tidak bisa mengubah role ke admin", 403);
      }

      if (newRole && newRole !== "WORKER" && newRole !== "DRIVER") {
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
      where: { email, deletedAt: null },
    });

    if (existingUser) {
      throw new ApiError(`User dengan email ${email} sudah terdaftar`, 400);
    }

    const existingPhone = await this.prisma.user.findFirst({
      where: { phoneNumber, deletedAt: null },
    });

    if (existingPhone) {
      throw new ApiError(`Nomor telepon ${phoneNumber} sudah digunakan`, 400);
    }

    const rolesRequiringProfile: Role[] = [
      Role.OUTLET_ADMIN,
      Role.WORKER,
      Role.DRIVER,
    ];
    if (rolesRequiringProfile.includes(role)) {
      if (!profile) {
        throw new ApiError(`Foto profil wajib untuk role ${role}`, 400);
      }

      await this.validateProfileFile(profile);
    }

    const employeeRoles: Role[] = [Role.OUTLET_ADMIN, Role.WORKER, Role.DRIVER];
    if (employeeRoles.includes(role)) {
      if (!targetOutletId) {
        throw new ApiError(`Outlet wajib dipilih untuk role ${role}`, 400);
      }

      if (!npwp) {
        throw new ApiError(`NPWP wajib diisi untuk role ${role}`, 400);
      }

      await this.validateOutlet(targetOutletId);
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
        throw new ApiError(`Email ${email} sudah digunakan user lain`, 400);
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
        throw new ApiError(`Nomor telepon ${phoneNumber} sudah digunakan`, 400);
      }
    }

    const newRoleRequiresEmployeeData = role && this.isEmployeeRoleString(role);

    if (newRoleRequiresEmployeeData) {
      if (!npwp) {
        throw new ApiError(`NPWP wajib untuk role ${role}`, 400);
      }

      if (!outletId) {
        throw new ApiError(`Outlet wajib untuk role ${role}`, 400);
      }

      await this.validateOutlet(Number(outletId));
    }
  };

  validateOutlet = async (outletId: number): Promise<void> => {
    if (isNaN(outletId) || outletId <= 0) {
      throw new ApiError("Outlet ID tidak valid", 400);
    }

    const outletExists = await this.prisma.outlet.findUnique({
      where: { id: outletId },
      select: { id: true, isActive: true, deletedAt: true },
    });

    if (!outletExists || outletExists.deletedAt) {
      throw new ApiError("Outlet tidak ditemukan", 404);
    }

    if (!outletExists.isActive) {
      throw new ApiError("Outlet tidak aktif", 400);
    }
  };

  validateUserExists = async (userId: number): Promise<any> => {
    if (isNaN(userId) || userId <= 0) {
      throw new ApiError("User ID tidak valid", 400);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        employees: {
          where: { deletedAt: null },
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

  private validateProfileFile = async (
    file: Express.Multer.File,
  ): Promise<void> => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    const maxSize = 1 * 1024 * 1024;

    if (!allowedTypes.includes(file.mimetype)) {
      throw new ApiError(
        "Format file tidak didukung. Gunakan JPG, JPEG, PNG, atau GIF",
        400,
      );
    }

    if (file.size > maxSize) {
      throw new ApiError("Ukuran file maksimal 1MB", 400);
    }
  };

  validateNotSelfAction = (
    currentUserId: number,
    targetUserId: number,
    action: string,
  ): void => {
    if (currentUserId === targetUserId) {
      throw new ApiError(`Anda tidak bisa ${action} akun sendiri`, 400);
    }
  };

  private isEmployeeRoleString(role: string): boolean {
    return role === "OUTLET_ADMIN" || role === "WORKER" || role === "DRIVER";
  }
}
