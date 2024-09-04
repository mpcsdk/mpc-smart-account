import {
  PendingExecuteCallArgs as NativePendingExecuteCallArgs,
  SimulateResult,
} from '@unipasswallet/relayer';

export interface SmartAccountTokenInfo {
  token: string;
  name: string;
  symbol: string;
  decimals: number;
  gasUsed: string;
  tokenPrice: number;
  nativeTokenPrice: number;
  error?: string;
}

export type SmartAccountSimulateResult = Omit<SimulateResult, 'feeTokens'> & {
  feeTokens: SmartAccountTokenInfo[];
};

export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}

export interface TokensInfo {
  tokens: TokenInfo[];
}

export interface FreeFeeOption {
  signature: string;
  expires: number;
}

export type PendingExecuteCallArgs = NativePendingExecuteCallArgs & {
  freeFeeOption?: FreeFeeOption;
};
