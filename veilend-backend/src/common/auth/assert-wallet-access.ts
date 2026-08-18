import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Enforces that the authenticated caller is either requesting their own
 * data (walletAddress matches the JWT-derived identity) or holds an admin
 * role (present in the `Admin` table), in which case they may query any
 * wallet. Non-admin callers requesting another wallet's data get a 403.
 *
 * This mirrors the ownership pattern used by AdminGuard (`../../auth/admin.guard.ts`)
 * for the admin lookup itself, but is applied inline rather than as a
 * route-level guard because the "allowed" wallet is only known once we've
 * parsed the route params (the caller can access their own resource without
 * being an admin at all).
 */
export async function assertWalletAccess(
  prisma: PrismaService,
  requesterWalletAddress: string,
  targetWalletAddress: string,
): Promise<void> {
  if (requesterWalletAddress === targetWalletAddress) {
    return;
  }

  const admin = await prisma.admin.findUnique({
    where: { walletAddress: requesterWalletAddress },
  });

  if (!admin) {
    throw new ForbiddenException(
      "You are not permitted to access this wallet's data",
    );
  }
}
