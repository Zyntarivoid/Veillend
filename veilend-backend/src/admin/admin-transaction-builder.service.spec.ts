import { Test, TestingModule } from '@nestjs/testing';
import {
  Account,
  Transaction,
  TransactionBuilder,
  Networks,
} from '@stellar/stellar-sdk';
import { AdminTransactionBuilderService } from './admin-transaction-builder.service';
import { AppConfigService } from '../config/app-config.service';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';
import { AdminActionType } from '@prisma/client';

const ADMIN_ADDRESS =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const ASSET_CONTRACT_ID =
  'CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5';
const VEILEND_CONTRACT_ID =
  'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';

interface InvokeHostFunctionLike {
  func: {
    invokeContract(): { functionName(): { toString(): string } };
  };
}

describe('AdminTransactionBuilderService', () => {
  let service: AdminTransactionBuilderService;

  const mockConfigService = {
    indexer: {
      contractId: VEILEND_CONTRACT_ID,
    },
    stellar: {
      networkPassphrase: Networks.TESTNET,
    },
  };

  const mockRpcService = {
    getClient: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminTransactionBuilderService,
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
        {
          provide: SorobanRpcService,
          useValue: mockRpcService,
        },
      ],
    }).compile();

    service = module.get<AdminTransactionBuilderService>(
      AdminTransactionBuilderService,
    );
    jest.clearAllMocks();
  });

  function mockAccount(sequence = '12345') {
    mockRpcService.getClient.mockReturnValue({
      // Return a fresh Account per call: TransactionBuilder mutates the
      // account's sequence when building, so a shared instance would advance
      // the nonce between builds.
      getAccount: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Account(ADMIN_ADDRESS, sequence)),
        ),
    });
  }

  function parseTx(xdrStr: string): Transaction {
    const tx = TransactionBuilder.fromXDR(xdrStr, Networks.TESTNET);
    if (!(tx instanceof Transaction)) {
      throw new Error('Expected a plain Transaction envelope');
    }
    return tx;
  }

  function invokeFunctionName(xdrStr: string): string {
    const tx = parseTx(xdrStr);
    const op = tx.operations[0] as unknown as InvokeHostFunctionLike;
    return op.func.invokeContract().functionName().toString();
  }

  function memoText(xdrStr: string): string {
    const tx = parseTx(xdrStr);
    const value = tx.memo.value as Buffer | string;
    return Buffer.isBuffer(value) ? value.toString('utf8') : value;
  }

  it('should build an unsigned XDR calling propose_configure_asset', async () => {
    mockAccount();
    const xdrStr = await service.buildActionXdr(
      'clxTestAction001',
      ADMIN_ADDRESS,
      AdminActionType.CONFIGURE_ASSET,
      { assetContractId: ASSET_CONTRACT_ID, supported: true },
    );

    expect(xdrStr).toBeTruthy();
    expect(invokeFunctionName(xdrStr)).toBe('propose_configure_asset');

    const tx = parseTx(xdrStr);
    expect(memoText(xdrStr)).toBe('clxTestAction001');
    expect(tx.source).toBe(ADMIN_ADDRESS);
  });

  it('should build an unsigned XDR calling set_oracle_price', async () => {
    mockAccount();
    const xdrStr = await service.buildActionXdr(
      'clxTestAction002',
      ADMIN_ADDRESS,
      AdminActionType.SET_ORACLE_PRICE,
      { assetContractId: ASSET_CONTRACT_ID, price: 100 },
    );

    expect(xdrStr).toBeTruthy();
    expect(invokeFunctionName(xdrStr)).toBe('set_oracle_price');
  });

  it('should build an unsigned XDR calling propose_set_min_collateral_ratio', async () => {
    mockAccount();
    const xdrStr = await service.buildActionXdr(
      'clxTestAction003',
      ADMIN_ADDRESS,
      AdminActionType.SET_MIN_COLLATERAL_RATIO,
      { minCollateralRatioBps: 15000 },
    );

    expect(xdrStr).toBeTruthy();
    expect(invokeFunctionName(xdrStr)).toBe('propose_set_min_collateral_ratio');
  });

  it('should throw when the VeilLend contract is not configured', async () => {
    mockRpcService.getClient.mockReturnValue({
      getAccount: jest.fn().mockResolvedValue(new Account(ADMIN_ADDRESS, '1')),
    });
    const module = await Test.createTestingModule({
      providers: [
        AdminTransactionBuilderService,
        {
          provide: AppConfigService,
          useValue: {
            indexer: { contractId: '' },
            stellar: { networkPassphrase: Networks.TESTNET },
          },
        },
        {
          provide: SorobanRpcService,
          useValue: mockRpcService,
        },
      ],
    }).compile();
    const unconfigured = module.get<AdminTransactionBuilderService>(
      AdminTransactionBuilderService,
    );

    await expect(
      unconfigured.buildActionXdr(
        'clxTestAction004',
        ADMIN_ADDRESS,
        AdminActionType.CONFIGURE_ASSET,
        { assetContractId: ASSET_CONTRACT_ID, supported: true },
      ),
    ).rejects.toThrow(/STELLAR_CONTRACT_ID/);
  });

  it('should build deterministic XDR for the same (nonce, actionId)', async () => {
    mockAccount('77777');
    const first = await service.buildActionXdr(
      'clxTestAction005',
      ADMIN_ADDRESS,
      AdminActionType.CONFIGURE_ASSET,
      { assetContractId: ASSET_CONTRACT_ID, supported: true },
    );
    const second = await service.buildActionXdr(
      'clxTestAction005',
      ADMIN_ADDRESS,
      AdminActionType.CONFIGURE_ASSET,
      { assetContractId: ASSET_CONTRACT_ID, supported: true },
    );

    expect(first).toBe(second);
  });

  it('should embed the action id as a memo and the sequence as the nonce', async () => {
    mockAccount('99999');
    const xdrStr = await service.buildActionXdr(
      'clxTestAction006',
      ADMIN_ADDRESS,
      AdminActionType.CONFIGURE_ASSET,
      { assetContractId: ASSET_CONTRACT_ID, supported: false },
    );

    const tx = parseTx(xdrStr);
    expect(tx.memo.type).toBe('text');
    expect(memoText(xdrStr)).toBe('clxTestAction006');
    // TransactionBuilder consumes the account's current sequence as the
    // nonce and advances it to the next available sequence number.
    expect(tx.sequence).toBe('100000');
  });
});
