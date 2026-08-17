import { IsString, Matches } from 'class-validator';

export class SubmitTxDto {
  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/, {
    message: 'txHash must be a 64-character hexadecimal string',
  })
  txHash: string;
}
