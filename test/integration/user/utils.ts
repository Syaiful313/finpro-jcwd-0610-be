import { Provider, Role, User } from "@prisma/client";

export const mockUserData = ({
  numberOfUsers = 10,
}: {
  numberOfUsers: number;
}): User[] => {
  const users = new Array(numberOfUsers).fill(null).map((_, index) => {
    const userNumber = index + 1;

    return {
      id: userNumber,
      firstName: "First" + userNumber,
      lastName: "Last" + userNumber,
      email: "Email" + userNumber + "@mail.com",
      password: "Password" + userNumber,
      role: Role.CUSTOMER,
      phoneNumber: BigInt(1000000000 + userNumber).toString(),
      emailVerificationToken: "token-" + userNumber,
      profilePic: null,
      isVerified: false,
      provider: Provider.CREDENTIAL,
      outletId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      notificationId: null,
    };
  });

  return users;
};
