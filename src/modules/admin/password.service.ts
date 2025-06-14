import argon2 from "argon2";

export class PasswordService {
  hashPassword = async (password: string): Promise<string> => {
    return await argon2.hash(password);
  };

  comparePassword = async (
    plainPassword: string,
    hashPassword: string,
  ): Promise<boolean> => {
    return await argon2.verify(hashPassword, plainPassword);
  };
}
