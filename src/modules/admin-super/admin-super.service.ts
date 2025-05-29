// import { Prisma } from "@prisma/client";
// import { injectable } from "tsyringe";
// import { ApiError } from "../../utils/api-error";
// import { CloudinaryService } from "../cloudinary/cloudinary.service";
// import { PrismaService } from "../prisma/prisma.service";
// import { CreateUserDTO } from "./dto/create-user.dto";
// import { GetUsersDTO } from "./dto/get-users.dto";
// import { UpdateUserDTO } from "./dto/update-user.dto";
// import { PasswordService } from "./password.service";

// @injectable()
// export class AdminSuperService {
//   private prisma: PrismaService;
//   private passwordService: PasswordService;
//   private cloudinaryService: CloudinaryService;

//   constructor(
//     PrismaClient: PrismaService,
//     PasswordService: PasswordService,
//     CloudinaryService: CloudinaryService,
//   ) {
//     this.cloudinaryService = CloudinaryService;
//     this.prisma = PrismaClient;
//     this.passwordService = PasswordService;
//   }

//   getUsers = async (query: GetUsersDTO) => {
//     const { page, take, sortBy, sortOrder, search, role } = query;

//     const whereClause: Prisma.UserWhereInput = {
//       deletedAt: null,
//     };

//     if (search) {
//       whereClause.OR = [
//         {
//           firstName: {
//             contains: search,
//             mode: "insensitive",
//           },
//         },
//         {
//           lastName: {
//             contains: search,
//             mode: "insensitive",
//           },
//         },
//         {
//           email: {
//             contains: search,
//             mode: "insensitive",
//           },
//         },
//       ];
//     }
//     if (role) {
//       whereClause.role = role;
//     }

//     const users = await this.prisma.user.findMany({
//       where: whereClause,
//       orderBy: { [sortBy]: sortOrder },
//       skip: (page - 1) * take,
//       take,
//       select: {
//         id: true,
//         firstName: true,
//         lastName: true,
//         email: true,
//         role: true,
//         phoneNumber: true,
//         profilePic: true,
//         isVerified: true,
//         provider: true,
//         createdAt: true,
//         updatedAt: true,
//         deletedAt: true,
//         notificationId: true,
//       },
//     });

//     const transformedUsers = users.map((user) => ({
//       ...user,
//       phoneNumber: user.phoneNumber.toString(),
//     }));

//     const count = await this.prisma.user.count({
//       where: whereClause,
//     });

//     return {
//       data: transformedUsers,
//       meta: {
//         page,
//         take,
//         total: count,
//       },
//     };
//   };

//   createUser = async (body: CreateUserDTO, profile: Express.Multer.File) => {
//     const {
//       firstName,
//       lastName,
//       email,
//       password,
//       role,
//       phoneNumber,
//       isVerified,
//       provider,
//     } = body;

//     const existingUser = await this.prisma.user.findFirst({
//       where: { email },
//     });

//     if (existingUser) {
//       throw new ApiError("User already exists", 400);
//     }

//     const phoneNumberBigInt = BigInt(phoneNumber);

//     const existingPhone = await this.prisma.user.findFirst({
//       where: { phoneNumber: phoneNumberBigInt },
//     });

//     if (existingPhone) {
//       throw new ApiError("User with this phone number already exists", 400);
//     }
//     const isVerifiedBool =
//       typeof isVerified === "string" ? isVerified === "true" : isVerified;

//     const { secure_url } = await this.cloudinaryService.upload(profile);

//     const hashedPassword = await this.passwordService.hassPassword(password);

//     const newUser = await this.prisma.user.create({
//       data: {
//         firstName,
//         lastName,
//         email,
//         password: hashedPassword,
//         phoneNumber: phoneNumberBigInt,
//         profilePic: secure_url,
//         isVerified: isVerifiedBool,
//         provider,
//         notificationId: body.notificationId || null,
//         role: role || "CUSTOMER",
//       },
//     });

//     return {
//       success: true,
//       message: "User created successfully",
//       data: { ...newUser, phoneNumber: newUser.phoneNumber.toString() },
//     };
//   };

//   deleteUser = async (id: number) => {
//     const user = await this.prisma.user.findUnique({
//       where: { id },
//     });

//     if (!user) {
//       throw new ApiError("User not found", 404);
//     }

//     await this.prisma.user.update({
//       where: { id },
//       data: { deletedAt: new Date() },
//     });

//     return {
//       success: true,
//       message: "User deleted successfully",
//     };
//   };

  // updateUser = async (
  //   userId: number,
  //   body: UpdateUserDTO,
  //   profile?: Express.Multer.File,
  // ) => {
  //   const {
  //     firstName,
  //     lastName,
  //     email,
  //     password,
  //     role,
  //     phoneNumber,
  //     isVerified,
  //     provider,
  //     notificationId,
  //   } = body;

  //   const existingUser = await this.prisma.user.findUnique({
  //     where: { id: userId },
  //   });

  //   if (!existingUser) {
  //     throw new ApiError("User not found", 404);
  //   }

  //   if (email && email !== existingUser.email) {
  //     const emailExists = await this.prisma.user.findFirst({
  //       where: {
  //         email,
  //         id: { not: userId },
  //       },
  //     });

  //     if (emailExists) {
  //       throw new ApiError("Email already exists", 400);
  //     }
  //   }

  //   let phoneNumberBigInt: bigint | undefined;
  //   if (phoneNumber) {
  //     phoneNumberBigInt = BigInt(phoneNumber);

  //     if (phoneNumberBigInt !== existingUser.phoneNumber) {
  //       const phoneExists = await this.prisma.user.findFirst({
  //         where: {
  //           phoneNumber: phoneNumberBigInt,
  //           id: { not: userId },
  //         },
  //       });

  //       if (phoneExists) {
  //         throw new ApiError("User with this phone number already exists", 400);
  //       }
  //     }
  //   }

  //   const isVerifiedBool =
  //     isVerified !== undefined
  //       ? typeof isVerified === "string"
  //         ? isVerified === "true"
  //         : isVerified
  //       : undefined;

  //   let profilePicUrl: string | undefined;
  //   if (profile) {
  //     const { secure_url } = await this.cloudinaryService.upload(profile);
  //     profilePicUrl = secure_url;
  //   }

  //   let hashedPassword: string | undefined;
  //   if (password) {
  //     hashedPassword = await this.passwordService.hassPassword(password);
  //   }

  //   const updateData: any = {};

  //   if (firstName !== undefined) updateData.firstName = firstName;
  //   if (lastName !== undefined) updateData.lastName = lastName;
  //   if (email !== undefined) updateData.email = email;
  //   if (hashedPassword !== undefined) updateData.password = hashedPassword;
  //   if (role !== undefined) updateData.role = role;
  //   if (phoneNumberBigInt !== undefined)
  //     updateData.phoneNumber = phoneNumberBigInt;
  //   if (profilePicUrl !== undefined) updateData.profilePic = profilePicUrl;
  //   if (isVerifiedBool !== undefined) updateData.isVerified = isVerifiedBool;
  //   if (provider !== undefined) updateData.provider = provider;
  //   if (notificationId !== undefined)
  //     updateData.notificationId = notificationId;

  //   const updatedUser = await this.prisma.user.update({
  //     where: { id: userId },
  //     data: updateData,
  //   });

  //   return {
  //     success: true,
  //     message: "User updated successfully",
  //     data: { ...updatedUser, phoneNumber: updatedUser.phoneNumber.toString() },
  //   };
  // };

  // }
