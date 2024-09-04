import { Signer, BigNumber } from 'ethers';
import { FreeFeeOption } from './relayer';

export const ERC6492_DETECTION_SUFFIX =
  '0x6492649264926492649264926492649264926492649264926492649264926492';

export type SmartAccountOptions = {
  masterKeySigner: Signer;
  appId: string;
  chainOptions: ChainOptions[];
  fetch?: typeof _fetch;
  unipassServerUrl?: string;
  keysetJson?: string;
  address?: string;
};

export type SmartAccountInitOptions = {
  chainId: number;
};

export interface SimulateResult {
  isFeeRequired: boolean;
  feeOptions: FeeOption[];
}

export interface FeeOption {
  token: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  to: string;
  amount: BigNumber;
  error?: string;
}

export interface SendTransactionOptions {
  fee?: FeeOption;
  freeFeeOption?: FreeFeeOption;
}

export interface SimulateTransactionOptions {
  feeToken?: string;
}

export interface ChainOptions {
  chainId: number;
  rpcUrl: string;
  relayerUrl?: string;
}

export enum SmartAccountStatus {
  Uninitialized,
  Initialized,
  Destroyed,
}
