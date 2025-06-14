import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateUserDTO } from "./dto/updateUser.dto";
import { CreateAddressDTO } from "./dto/createAddress.dto";
import { EditAddressDTO } from "./dto/editAddress.dto";

@injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  getUser = async (authUserId: number) => {
    const user = await this.prisma.user.findUnique({
      where: { id: authUserId },
      include: {
        addresses: {
          where: { deletedAt: null },
        },
      },
    });

    if (!user) {
      throw new ApiError("Invalid user id", 404);
    }

    const { password: pw, ...userWithoutPassword } = user;

    return { ...userWithoutPassword };
  };

  updateUser = async (authUserId: number, body: UpdateUserDTO) => {
    const { firstName, lastName, email, phoneNumber } = body;
    const user = await this.prisma.user.findUnique({
      where: { id: authUserId },
    });

    if (!user) {
      throw new ApiError("Invalid user id", 404);
    }

    const isEmailChanged = email && email !== user.email;

    const updatedUser = await this.prisma.user.update({
      where: { id: authUserId },
      data: {
        firstName,
        lastName,
        email,
        phoneNumber,
        isVerified: isEmailChanged ? false : user.isVerified,
      },
      include: {
        addresses: true,
      },
    });

    const { password: pw, ...updatedUserWithoutPassword } = updatedUser;

    return { ...updatedUserWithoutPassword };
  };

  uploadProfilePic = async (authUserId: number, uploadPath: string) => {
    const user = await this.prisma.user.findUnique({
      where: { id: authUserId },
    });

    if (!user) {
      throw new ApiError("Invalid user id", 404);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: authUserId },
      data: {
        profilePic: uploadPath,
      },
      include: {
        addresses: true,
      },
    });

    const { password: pw, ...updatedUserWithoutPassword } = updatedUser;
    return { ...updatedUserWithoutPassword };
  };

  createUserAddress = async (authUserId: number, body: CreateAddressDTO) => {
    const {
      addressName,
      addressLine,
      district,
      city,
      province,
      postalCode,
      latitude,
      longitude,
      isPrimary,
    } = body;
    const user = await this.prisma.user.findUnique({
      where: { id: authUserId },
    });

    if (!user) {
      throw new ApiError("Invalid user id", 404);
    }

    if (isPrimary) {
      await this.prisma.address.updateMany({
        where: {
          userId: authUserId,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      });
    }

    const newAddress = await this.prisma.address.create({
      data: {
        userId: authUserId,
        addressName,
        addressLine,
        district,
        city,
        province,
        postalCode,
        latitude,
        longitude,
        isPrimary,
      },
    });

    return newAddress;
  };

  editAddress = async (authUserId: number, body: EditAddressDTO) => {
    const {
      addressId,
      addressName,
      addressLine,
      district,
      city,
      province,
      postalCode,
      latitude,
      longitude,
      isPrimary,
    } = body;

    const user = await this.prisma.user.findUnique({
      where: { id: authUserId },
    });

    if (!user) {
      throw new ApiError("Invalid user id", 404);
    }

    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new ApiError("Invalid address id", 404);
    }

    if (address.userId !== authUserId) {
      throw new ApiError("Unauthorised", 404);
    }

    if (isPrimary) {
      await this.prisma.address.updateMany({
        where: {
          userId: authUserId,
          isPrimary: true,
          id: { not: addressId }, // Don't unset this one
        },
        data: {
          isPrimary: false,
        },
      });
    }

    const updatedAddress = await this.prisma.address.update({
      where: { id: addressId },
      data: {
        addressName,
        addressLine,
        district,
        city,
        province,
        postalCode,
        latitude,
        longitude,
        isPrimary,
      },
    });

    return updatedAddress;
  };

  deleteAddress = async (authUserId: number, addressId: number) => {
    const user = await this.prisma.user.findUnique({
      where: { id: authUserId },
    });

    if (!user) {
      throw new ApiError("Invalid user id", 404);
    }

    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new ApiError("Invalid address id", 404);
    }

    if (address.userId !== authUserId) {
      throw new ApiError("Unauthorised", 404);
    }

    const deletedAddress = await this.prisma.address.update({
      where: { id: addressId },
      data: {
        addressName: "",
        addressLine: "",
        district: "",
        city: "",
        province: "",
        postalCode: "",
        latitude: 0,
        longitude: 0,
        isPrimary: false,
        deletedAt: new Date(),
      },
    });

    return deletedAddress;
  };
}
