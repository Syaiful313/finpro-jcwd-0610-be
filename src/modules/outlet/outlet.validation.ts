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
export class OutletValidation {
  constructor(private readonly prisma: PrismaService) {}

  // Optional: Additional validation method
  validateOutletExists = async (outletId: number) => {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: outletId },
      include: {
        employees: true,
        orders: true,
      },
    });

    if (!outlet) {
      throw new ApiError("Outlet tidak ditemukan", 404);
    }

    return outlet;
  };

  // Optional: Business validation for outlet update
  validateOutletUpdateData = async (data: {
    outletId: number;
    outletName?: string;
    latitude?: number;
    longitude?: number;
  }) => {
    const { outletId, outletName, latitude, longitude } = data;

    // Check for duplicate name
    if (outletName) {
      const existingOutletByName = await this.prisma.outlet.findFirst({
        where: {
          outletName: {
            equals: outletName,
            mode: "insensitive",
          },
          id: {
            not: outletId,
          },
        },
      });

      if (existingOutletByName) {
        throw new ApiError("Nama outlet sudah digunakan", 400);
      }
    }

    // Check for nearby outlets (if location is being updated)
    if (latitude !== undefined && longitude !== undefined) {
      const degreeOffset = 1 / 111; // approximately 1km

      const nearbyOutlets = await this.prisma.outlet.findMany({
        where: {
          AND: [
            {
              latitude: {
                gte: latitude - degreeOffset,
                lte: latitude + degreeOffset,
              },
            },
            {
              longitude: {
                gte: longitude - degreeOffset,
                lte: longitude + degreeOffset,
              },
            },
            {
              id: {
                not: outletId, // Exclude current outlet
              },
            },
          ],
        },
      });

      if (nearbyOutlets.length > 0) {
        console.warn(
          `Warning: Ada outlet lain dalam radius 1km dari lokasi yang dipilih`,
        );
        // Note: Ini hanya warning, tidak throw error karena mungkin acceptable
      }
    }
  };
}
