// import { Prisma } from "@prisma/client";
// import { injectable } from "tsyringe";
// import { ApiError } from "../../utils/api-error";
// import { CloudinaryService } from "../cloudinary/cloudinary.service";
// import { PrismaService } from "../prisma/prisma.service";
// import { CreateOutletUserDTO } from "./dto/create-outlet-user.dto";
// import { GetOutletUsersDTO } from "./dto/get-outlet-user.dto";
// import { UpdateOutletUserDTO } from "./dto/update-outlet-user.dto";
// import { PasswordService } from "./password.service";

// @injectable()
// export class AdminOutletUserService {
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

//   getOutletUsers = async (outletId: number, query: GetOutletUsersDTO) => {
//     const { page, take, sortBy, sortOrder, search, role } = query;

//     const whereClause: Prisma.UserWhereInput = {
//       deletedAt: null,
//       OR: [
//         {
//           orders: {
//             some: {
//               outletId: outletId,
//             },
//           },
//         },
//         {
//           employees: {
//             some: {
//               outletId: outletId,
//             },
//           },
//         },
//       ],
//     };

//     if (search) {
//       whereClause.AND = [
//         {
//           OR: [
//             {
//               firstName: {
//                 contains: search,
//                 mode: "insensitive",
//               },
//             },
//             {
//               lastName: {
//                 contains: search,
//                 mode: "insensitive",
//               },
//             },
//             {
//               email: {
//                 contains: search,
//                 mode: "insensitive",
//               },
//             },
//           ],
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
//         _count: {
//           select: {
//             orders: {
//               where: {
//                 outletId: outletId,
//               },
//             },
//           },
//         },
//         employees: {
//           where: {
//             outletId: outletId,
//           },
//           select: {
//             id: true,
//             npwp: true,
//             createdAt: true,
//           },
//         },
//       },
//     });

//     const transformedUsers = users.map((user) => ({
//       ...user,
//       phoneNumber: user.phoneNumber.toString(),
//       totalOrdersInOutlet: user._count.orders,
//       employeeInfo: user.employees.length > 0 ? user.employees[0] : null,
//       _count: undefined,
//       employees: undefined,
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

//   createOutletUser = async (
//     outletId: number,
//     body: CreateOutletUserDTO,
//     profile: Express.Multer.File,
//   ) => {
//     const {
//       firstName,
//       lastName,
//       email,
//       password,
//       role,
//       phoneNumber,
//       isVerified,
//       provider,
//       notificationId,
//       npwp,
//     } = body;

//     // ✅ Role validation - only WORKER and DRIVER allowed
//     if (role && !["WORKER", "DRIVER"].includes(role)) {
//       throw new ApiError(
//         "Admin outlet can only create WORKER or DRIVER users",
//         403,
//       );
//     }

//     // ✅ Provider validation
//     if (provider && !["GOOGLE", "CREDENTIAL"].includes(provider)) {
//       throw new ApiError("Provider must be either GOOGLE or CREDENTIAL", 400);
//     }

//     // ✅ NPWP validation for both WORKER and DRIVER
//     if (
//       (role === "WORKER" || role === "DRIVER") &&
//       (!npwp || npwp.trim() === "")
//     ) {
//       throw new ApiError("NPWP is required for WORKER and DRIVER roles", 400);
//     }

//     // ✅ Outlet validation
//     const outlet = await this.prisma.outlet.findUnique({
//       where: { id: outletId },
//     });

//     if (!outlet) {
//       throw new ApiError("Outlet not found", 404);
//     }

//     // ✅ Email uniqueness validation
//     const existingUser = await this.prisma.user.findFirst({
//       where: { email },
//     });

//     if (existingUser) {
//       throw new ApiError("User already exists", 400);
//     }

//     // ✅ Safe phone number parsing
//     let phoneNumberBigInt: bigint;
//     try {
//       phoneNumberBigInt = BigInt(phoneNumber);
//     } catch (error) {
//       throw new ApiError("Invalid phone number format", 400);
//     }

//     // ✅ Phone number uniqueness validation
//     const existingPhone = await this.prisma.user.findFirst({
//       where: { phoneNumber: phoneNumberBigInt },
//     });

//     if (existingPhone) {
//       throw new ApiError("User with this phone number already exists", 400);
//     }

//     // ✅ Notification validation
//     if (notificationId) {
//       const notification = await this.prisma.notification.findUnique({
//         where: { id: notificationId },
//       });

//       if (!notification) {
//         throw new ApiError("Notification not found", 404);
//       }
//     }

//     // ✅ Profile picture upload
//     const { secure_url } = await this.cloudinaryService.upload(profile);

//     // ✅ Boolean conversion for isVerified
//     const isVerifiedBool =
//       typeof isVerified === "string" ? isVerified === "true" : isVerified;

//     // ✅ Password hashing
//     const hashedPassword = await this.passwordService.hassPassword(password);

//     // ✅ Transaction for user and employee creation
//     const result = await this.prisma.$transaction(async (tx) => {
//       const newUser = await tx.user.create({
//         data: {
//           firstName,
//           lastName,
//           email,
//           password: hashedPassword,
//           phoneNumber: phoneNumberBigInt,
//           profilePic: secure_url,
//           isVerified: isVerifiedBool,
//           provider: provider || "CREDENTIAL",
//           notificationId: notificationId || null,
//           role: role || "WORKER",
//         },
//       });

//       // ✅ Create employee record for both WORKER and DRIVER
//       let employee = null;
//       if (role === "WORKER" || role === "DRIVER") {
//         employee = await tx.employee.create({
//           data: {
//             userId: newUser.id,
//             outletId: outletId,
//             npwp: npwp!,
//           },
//         });
//       }

//       return {
//         user: newUser,
//         employee,
//       };
//     });

//     return {
//       success: true,
//       message: "User created successfully",
//       data: {
//         ...result.user,
//         phoneNumber: result.user.phoneNumber.toString(),
//         isEmployee: ["WORKER", "DRIVER"].includes(role || "WORKER"),
//         employeeData: result.employee
//           ? {
//               id: result.employee.id,
//               npwp: result.employee.npwp,
//               outletId: result.employee.outletId,
//             }
//           : null,
//       },
//     };
//   };

//   updateOutletUser = async (
//     outletId: number,
//     userId: number,
//     body: UpdateOutletUserDTO,
//     profile?: Express.Multer.File,
//   ) => {
//     const {
//       firstName,
//       lastName,
//       email,
//       password,
//       role,
//       phoneNumber,
//       isVerified,
//       provider,
//       notificationId,
//       npwp,
//     } = body;

//     // ✅ Check user access - only employees of this outlet
//     const userAccess = await this.prisma.user.findFirst({
//       where: {
//         id: userId,
//         deletedAt: null,
//         employees: {
//           some: {
//             outletId: outletId,
//           },
//         },
//       },
//       include: {
//         employees: {
//           where: {
//             outletId: outletId,
//           },
//         },
//       },
//     });

//     if (!userAccess) {
//       throw new ApiError(
//         "User not found or not accessible by this outlet",
//         404,
//       );
//     }

//     // ✅ Role validation - only WORKER and DRIVER allowed
//     if (role && !["WORKER", "DRIVER"].includes(role)) {
//       throw new ApiError("Can only update WORKER or DRIVER roles", 403);
//     }

//     // ✅ Provider validation
//     if (provider && !["GOOGLE", "CREDENTIAL"].includes(provider)) {
//       throw new ApiError("Provider must be either GOOGLE or CREDENTIAL", 400);
//     }

//     // ✅ Email uniqueness validation
//     if (email && email !== userAccess.email) {
//       const emailExists = await this.prisma.user.findFirst({
//         where: {
//           email,
//           id: { not: userId },
//         },
//       });

//       if (emailExists) {
//         throw new ApiError("Email already exists", 400);
//       }
//     }

//     // ✅ Safe phone number parsing and validation
//     let phoneNumberBigInt: bigint | undefined;
//     if (phoneNumber) {
//       try {
//         phoneNumberBigInt = BigInt(phoneNumber);
//       } catch (error) {
//         throw new ApiError("Invalid phone number format", 400);
//       }

//       if (phoneNumberBigInt !== userAccess.phoneNumber) {
//         const phoneExists = await this.prisma.user.findFirst({
//           where: {
//             phoneNumber: phoneNumberBigInt,
//             id: { not: userId },
//           },
//         });

//         if (phoneExists) {
//           throw new ApiError("User with this phone number already exists", 400);
//         }
//       }
//     }

//     // ✅ Notification validation
//     if (notificationId) {
//       const notification = await this.prisma.notification.findUnique({
//         where: { id: notificationId },
//       });

//       if (!notification) {
//         throw new ApiError("Notification not found", 404);
//       }
//     }

//     // ✅ NPWP validation for role changes
//     if (
//       role &&
//       (role === "WORKER" || role === "DRIVER") &&
//       npwp &&
//       npwp.trim() === ""
//     ) {
//       throw new ApiError("NPWP is required for WORKER and DRIVER roles", 400);
//     }

//     // ✅ Boolean conversion for isVerified
//     const isVerifiedBool =
//       isVerified !== undefined
//         ? typeof isVerified === "string"
//           ? isVerified === "true"
//           : isVerified
//         : undefined;

//     // ✅ Profile picture upload
//     let profilePicUrl: string | undefined;
//     if (profile) {
//       const { secure_url } = await this.cloudinaryService.upload(profile);
//       profilePicUrl = secure_url;
//     }

//     // ✅ Password hashing
//     let hashedPassword: string | undefined;
//     if (password) {
//       hashedPassword = await this.passwordService.hassPassword(password);
//     }

//     // ✅ Prepare update data
//     const updateData: any = {};
//     if (firstName !== undefined) updateData.firstName = firstName;
//     if (lastName !== undefined) updateData.lastName = lastName;
//     if (email !== undefined) updateData.email = email;
//     if (hashedPassword !== undefined) updateData.password = hashedPassword;
//     if (role !== undefined) updateData.role = role;
//     if (phoneNumberBigInt !== undefined)
//       updateData.phoneNumber = phoneNumberBigInt;
//     if (profilePicUrl !== undefined) updateData.profilePic = profilePicUrl;
//     if (isVerifiedBool !== undefined) updateData.isVerified = isVerifiedBool;
//     if (provider !== undefined) updateData.provider = provider;
//     if (notificationId !== undefined)
//       updateData.notificationId = notificationId;

//     // ✅ Transaction for user and employee updates
//     const result = await this.prisma.$transaction(async (tx) => {
//       // Update user data
//       const updatedUser = await tx.user.update({
//         where: { id: userId },
//         data: updateData,
//       });

//       // ✅ Handle employee record updates
//       const currentEmployee = userAccess.employees[0];
//       let updatedEmployee = currentEmployee;

//       // Update NPWP if provided
//       if (npwp !== undefined && currentEmployee) {
//         updatedEmployee = await tx.employee.update({
//           where: { id: currentEmployee.id },
//           data: { npwp },
//         });
//       }

//       // ✅ Handle role changes
//       if (role && role !== userAccess.role) {
//         // If user doesn't have employee record but new role requires it
//         if (!currentEmployee && (role === "WORKER" || role === "DRIVER")) {
//           if (!npwp || npwp.trim() === "") {
//             throw new ApiError(
//               "NPWP is required for WORKER and DRIVER roles",
//               400,
//             );
//           }

//           updatedEmployee = await tx.employee.create({
//             data: {
//               userId: userId,
//               outletId: outletId,
//               npwp: npwp,
//             },
//           });
//         }
//       }

//       return {
//         user: updatedUser,
//         employee: updatedEmployee,
//       };
//     });

//     return {
//       success: true,
//       message: "User updated successfully",
//       data: {
//         ...result.user,
//         phoneNumber: result.user.phoneNumber.toString(),
//         isEmployee: ["WORKER", "DRIVER"].includes(result.user.role),
//         employeeData: result.employee
//           ? {
//               id: result.employee.id,
//               npwp: result.employee.npwp,
//               outletId: result.employee.outletId,
//             }
//           : null,
//       },
//     };
//   };

//   deleteUser = async (outletId: number, userId: number) => {
//     const user = await this.prisma.user.findFirst({
//       where: {
//         id: userId,
//         deletedAt: null,
//         role: {
//           notIn: ["ADMIN", "OUTLET_ADMIN"],
//         },
//         OR: [
//           {
//             orders: {
//               some: {
//                 outletId: outletId,
//               },
//             },
//           },
//           {
//             employees: {
//               some: {
//                 outletId: outletId,
//               },
//             },
//           },
//         ],
//       },
//     });

//     if (!user) {
//       throw new ApiError(
//         "User not found or cannot be deleted by this outlet",
//         404,
//       );
//     }

//     await this.prisma.user.update({
//       where: { id: userId },
//       data: { deletedAt: new Date() },
//     });

//     return {
//       success: true,
//       message: "User deleted successfully",
//     };
//   };

//   getUserDetails = async (outletId: number, userId: number) => {
//     const user = await this.prisma.user.findFirst({
//       where: {
//         id: userId,
//         deletedAt: null,
//         OR: [
//           {
//             orders: {
//               some: {
//                 outletId: outletId,
//               },
//             },
//           },
//           {
//             employees: {
//               some: {
//                 outletId: outletId,
//               },
//             },
//           },
//         ],
//       },
//       include: {
//         orders: {
//           where: {
//             outletId: outletId,
//           },
//           orderBy: {
//             createdAt: "desc",
//           },
//         },
//         employees: {
//           where: {
//             outletId: outletId,
//           },
//           include: {
//             attendances: {
//               orderBy: {
//                 createdAt: "desc",
//               },
//               take: 10,
//             },
//           },
//         },
//         addresses: true,
//       },
//     });

//     if (!user) {
//       throw new ApiError(
//         "User not found or not accessible by this outlet",
//         404,
//       );
//     }

//     return {
//       success: true,
//       data: {
//         ...user,
//         phoneNumber: user.phoneNumber.toString(),
//       },
//     };
//   };
// }
