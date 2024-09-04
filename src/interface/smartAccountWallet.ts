import { providers } from 'ethers';

export type SmartAccountResponse = providers.TransactionResponse & {
  wait: (
    confirmations?: number,
    timeout?: number
  ) => Promise<providers.TransactionReceipt>;
};
