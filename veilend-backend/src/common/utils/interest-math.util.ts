import { Prisma } from '@prisma/client';

export function computeAccruedPosition(
  depositedRaw: bigint,
  borrowedRaw: bigint,
  supplyIndexSnapshot: Prisma.Decimal,
  borrowIndexSnapshot: Prisma.Decimal,
  currentSupplyIndex: Prisma.Decimal,
  currentBorrowIndex: Prisma.Decimal,
): { adjustedDeposited: bigint; adjustedBorrowed: bigint } {
  let adjustedDeposited = depositedRaw;
  let adjustedBorrowed = borrowedRaw;

  if (borrowIndexSnapshot.gt(0) && supplyIndexSnapshot.gt(0)) {
    if (adjustedBorrowed > 0n) {
      const growth =
        Number(currentBorrowIndex.minus(borrowIndexSnapshot)) /
        Number(borrowIndexSnapshot);
      if (growth > 0) {
        adjustedBorrowed += BigInt(
          Math.floor(Number(adjustedBorrowed) * growth),
        );
      }
    }
    if (adjustedDeposited > 0n) {
      const growth =
        Number(currentSupplyIndex.minus(supplyIndexSnapshot)) /
        Number(supplyIndexSnapshot);
      if (growth > 0) {
        adjustedDeposited += BigInt(
          Math.floor(Number(adjustedDeposited) * growth),
        );
      }
    }
  }

  return { adjustedDeposited, adjustedBorrowed };
}
