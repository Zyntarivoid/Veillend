export interface MappedContractError {
  title: string;
  description: string;
  code?: number | string;
}

/**
 * Maps Soroban contract panic codes (1-17), contract error names, and generic RPC/429/wallet errors
 * into user-friendly title and description objects.
 */
export function mapContractError(
  rc: number | string | Error | null | undefined,
): MappedContractError {
  if (rc === null || rc === undefined) {
    return {
      title: 'Unknown Error',
      description: 'An unexpected protocol error occurred. Please try again.',
    };
  }

  // Handle Error instances
  if (rc instanceof Error) {
    const message = rc.message;
    // Check if the error message contains known error names or numeric codes
    if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
      return {
        title: 'Rate Limit Exceeded',
        description: 'Too many requests sent to the RPC node. Please wait a moment and try again.',
        code: 429,
      };
    }
    if (message.toLowerCase().includes('user rejected') || message.toLowerCase().includes('declined')) {
      return {
        title: 'Transaction Cancelled',
        description: 'The transaction request was cancelled or declined in your wallet.',
      };
    }

    // Try extracting numeric code from string like "Error(Contract, #13)" or "HostError: Error(Contract, #13)"
    const match = message.match(/#(1[0-7]|[1-9])/);
    if (match) {
      return mapNumericCode(parseInt(match[1], 10));
    }

    // Try string error names
    for (const [name, code] of Object.entries(ERROR_NAME_MAP)) {
      if (message.includes(name)) {
        return mapNumericCode(code);
      }
    }

    return {
      title: 'Transaction Failed',
      description: message || 'The operation failed during execution.',
    };
  }

  // Handle numeric code passed directly
  if (typeof rc === 'number') {
    return mapNumericCode(rc);
  }

  // Handle string input (numeric string or error code name)
  const parsedNum = parseInt(String(rc), 10);
  if (!isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= 17) {
    return mapNumericCode(parsedNum);
  }

  const strUpper = String(rc).trim();
  if (ERROR_NAME_MAP[strUpper]) {
    return mapNumericCode(ERROR_NAME_MAP[strUpper]);
  }

  // Generic string matching for 429
  if (strUpper.includes('429')) {
    return {
      title: 'Rate Limit Exceeded',
      description: 'Too many requests sent to the RPC node. Please wait a moment and try again.',
      code: 429,
    };
  }

  return {
    title: 'Transaction Failed',
    description: String(rc) || 'An error occurred during transaction execution.',
  };
}

const ERROR_NAME_MAP: Record<string, number> = {
  AlreadyInitialized: 1,
  Unauthorized: 2,
  UnsupportedAsset: 3,
  InvalidAmount: 4,
  InsufficientCollateral: 5,
  InsufficientDeposit: 6,
  RepayTooLarge: 7,
  InvalidCollateralRatio: 8,
  NotInitialized: 9,
  ZeroAmount: 10,
  OraclePriceMissing: 11,
  ContractPaused: 12,
  DepositCapExceeded: 13,
  BorrowCapExceeded: 14,
  InvalidCap: 15,
  CircuitBreakerTriggered: 16,
  InsufficientReserve: 17,
};

function mapNumericCode(code: number): MappedContractError {
  switch (code) {
    case 1:
      return {
        title: 'Protocol Already Initialized',
        description: 'The protocol contract has already been initialized.',
        code,
      };
    case 2:
      return {
        title: 'Unauthorized Action',
        description: 'You are not authorized to perform this protocol action.',
        code,
      };
    case 3:
      return {
        title: 'Unsupported Asset',
        description: 'The selected asset is not supported by the VeilLend protocol.',
        code,
      };
    case 4:
      return {
        title: 'Invalid Amount',
        description: 'The specified amount is invalid or out of allowed bounds.',
        code,
      };
    case 5:
      return {
        title: 'Insufficient Collateral',
        description: 'Your collateral is insufficient to support this operation or maintain health factor.',
        code,
      };
    case 6:
      return {
        title: 'Insufficient Deposit',
        description: 'Your deposited balance is lower than the requested withdrawal amount.',
        code,
      };
    case 7:
      return {
        title: 'Repay Amount Exceeds Debt',
        description: 'The repayment amount exceeds your current outstanding debt balance.',
        code,
      };
    case 8:
      return {
        title: 'Invalid Collateral Ratio',
        description: 'The operation would violate minimum required collateral ratio rules.',
        code,
      };
    case 9:
      return {
        title: 'Protocol Not Initialized',
        description: 'The protocol contract has not been initialized yet.',
        code,
      };
    case 10:
      return {
        title: 'Zero Amount',
        description: 'Transaction amount must be strictly greater than zero.',
        code,
      };
    case 11:
      return {
        title: 'Oracle Price Missing',
        description: 'Price feed data for this asset is currently unavailable from the oracle.',
        code,
      };
    case 12:
      return {
        title: 'Contract Paused',
        description: 'Protocol contract operations are currently paused by administration.',
        code,
      };
    case 13:
      return {
        title: 'Deposit Cap Exceeded',
        description: 'This asset has reached its maximum protocol deposit cap limit.',
        code,
      };
    case 14:
      return {
        title: 'Borrow Cap Exceeded',
        description: 'This asset has reached its maximum protocol borrow cap limit.',
        code,
      };
    case 15:
      return {
        title: 'Invalid Cap Value',
        description: 'The protocol cap parameters for this asset are invalid.',
        code,
      };
    case 16:
      return {
        title: 'Circuit Breaker Triggered',
        description: 'Protocol safety circuit breaker is active due to extreme market volatility.',
        code,
      };
    case 17:
      return {
        title: 'Insufficient Pool Reserve',
        description: 'The pool reserve currently lacks sufficient liquidity for this request.',
        code,
      };
    case 429:
      return {
        title: 'Rate Limit Exceeded',
        description: 'Too many requests sent to the RPC node. Please wait a moment and try again.',
        code,
      };
    default:
      return {
        title: 'Transaction Failed',
        description: `Contract returned unexpected error code ${code}.`,
        code,
      };
  }
}
