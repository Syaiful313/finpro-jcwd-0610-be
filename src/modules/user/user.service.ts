import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateUserDTO } from "./dto/updateUser.dto";
import { CreateAddressDTO } from "./dto/createAddress.dto";

@injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  getUser = async (authUserId: number) => {
    const user = await this.prisma.user.findUnique({
      where: { id: authUserId },
      include: {
        addresses: true,
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

    const updatedUser = await this.prisma.user.update({
      where: { id: authUserId },
      data: {
        firstName,
        lastName,
        email,
        phoneNumber,
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
    } = body;
    const user = await this.prisma.user.findUnique({
      where: { id: authUserId },
    });

    if (!user) {
      throw new ApiError("Invalid user id", 404);
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
      },
    });

    return newAddress;
  };
}
