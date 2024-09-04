import {
  PendingExecuteCallArgs,
  RpcRelayer,
  SimulateArgs,
  SimulateExecute,
  SimulateKey,
} from '@unipasswallet/relayer';
import { SmartAccountSimulateResult, TokensInfo } from '../interface/relayer';
import { SmartAccountRpcService } from './rpcService';
import { UnipassWalletContext } from '@unipasswallet/network';
import { providers } from 'ethers';
import * as CrossFetch from 'cross-fetch';

export class SmartAccountRelayer extends RpcRelayer {
  override readonly rpcService: SmartAccountRpcService;

  constructor(
    relayerUrl: string,
    context: UnipassWalletContext,
    provider: providers.Provider,
    public readonly appId: string,
    originFetch?: typeof fetch
  ) {
    const newFetch = originFetch || CrossFetch.fetch;
    super(relayerUrl, context, provider, newFetch);
    this.rpcService = new SmartAccountRpcService(relayerUrl, newFetch);
  }

  override async simulate(
    target: string,
    keyset: SimulateKey[],
    execute: SimulateExecute,
    token?: string
  ): Promise<SmartAccountSimulateResult> {
    const args: SimulateArgs = {
      target,
      keyset,
      execute,
      token,
    };

    return this.rpcService.simulate(args, {
      'X-UP-APP-ID': this.appId,
    });
  }

  override async relay(transactions: PendingExecuteCallArgs): Promise<string> {
    return this.rpcService.sendTransaction(transactions, {
      'X-UP-APP-ID': this.appId,
    });
  }

  async getFeeTokens(): Promise<TokensInfo> {
    return this.rpcService.getFeeTokens();
  }
}
