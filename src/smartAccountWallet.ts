/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ExecuteCall,
  FeeActionPointSig,
  TxnReceiptResult,
} from '@unipasswallet/relayer';
import {
  BundledExecuteCall,
  MainExecuteCall,
  RawBundledExecuteCall,
  RawMainExecuteCall,
  SessionKey,
  Wallet,
  WalletOptions,
} from 'mpc-wallet';
import {
  BigNumber,
  TypedDataDomain,
  TypedDataField,
  constants,
  providers,
} from 'ethers';
import {
  FreeFeeOption,
  PendingExecuteCallArgs,
  SmartAccountResponse,
  SmartAccountSimulateResult,
} from './interface';
import {
  _TypedDataEncoder,
  getCreate2Address,
  keccak256,
  solidityPack,
} from 'ethers/lib/utils';
import { MAINNET_UNIPASS_WALLET_CONTEXT } from '@unipasswallet/network';
import { CreationCode, SingletonFactoryAddress } from '@unipasswallet/utils';

const DEFAULT_TIMEOUT = 60;

export class SmartAccountWallet extends Wallet {
  constructor(options: WalletOptions) {
    super(options);
    this.keyset = options.keyset;
  }

  static override create(options: WalletOptions): SmartAccountWallet {
    const createOptions = options;
    const { keyset, context = MAINNET_UNIPASS_WALLET_CONTEXT } = createOptions;
    if (!createOptions.address) {
      const address = getCreate2Address(
        SingletonFactoryAddress,
        keyset.hash(),
        keccak256(
          solidityPack(['bytes', 'uint256'], [CreationCode, context.moduleMain])
        )
      );

      createOptions.address = address;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new SmartAccountWallet(options);
  }

  async sendSmartSignedTransactions(sendSignedTransactions: {
    execute: MainExecuteCall | BundledExecuteCall;
    chainId: number;
    nonce: BigNumber;
    feeActionPointSig?: FeeActionPointSig;
    freeFeeOption?: FreeFeeOption;
  }): Promise<SmartAccountResponse> {
    const { execute, chainId, nonce, feeActionPointSig, freeFeeOption } =
      sendSignedTransactions;
    const call: ExecuteCall = execute.toExecuteCall();
    const args: PendingExecuteCallArgs = {
      call: JSON.stringify(call),
      walletAddress: this.target(execute),
      feeActionPointSig,
      freeFeeOption,
    };

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const hash = await this.relayer!.relay(args);

    return {
      hash,
      confirmations: 1,
      from: this.address,
      chainId,
      nonce: nonce.toNumber(),
      gasLimit: constants.Zero,
      data: execute.ethAbiEncode(),
      value: constants.Zero,
      wait: async (confirmations?: number, timeout: number = DEFAULT_TIMEOUT) =>
        this.waitForTransaction(hash, confirmations || 1, timeout),
    };
  }

  override async waitForTransaction(
    txHash: string,
    _confirmations = 1,
    timeout: number
  ): Promise<providers.TransactionReceipt> {
    let ret: TxnReceiptResult;
    let i = 0;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const relayer = this.relayer!;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (i < timeout) {
        // eslint-disable-next-line no-await-in-loop
        ret = await relayer.wait(txHash);

        if (ret && ret.receipt) {
          break;
        }
        // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        return Promise.reject(new Error('Timeout Error'));
      }
      i++;
    }
    const { receipt } = ret;

    return receipt;
  }

  override async sendTransactions(
    rawExecute: RawMainExecuteCall | RawBundledExecuteCall,
    feeActionPointSig?: FeeActionPointSig,
    freeFeeOption?: FreeFeeOption
  ): Promise<SmartAccountResponse> {
    //transaction step4

    const { execute, chainId, nonce } = await this.signTransactions(rawExecute);

    return this.sendSmartSignedTransactions({
      execute,
      chainId,
      nonce,
      feeActionPointSig,
      freeFeeOption,
    });
  }

  override async simulateExecute(
    execute: RawMainExecuteCall | RawBundledExecuteCall,
    token?: string | undefined
  ): Promise<SmartAccountSimulateResult> {
    const res = await super.simulateExecute(execute, token);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res as any;
  }

  async signDigest(
    digest: string,
    sessionKeyOrSignerIndexes: number[] | SessionKey = [0]
  ): Promise<string> {
    return super.signMessage(digest, sessionKeyOrSignerIndexes, true);
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: Record<string, any>
  ): Promise<string> {
    return this._signTypedData(domain, types, value);
  }

  async _signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: Record<string, any>
  ): Promise<string> {
    const digest = _TypedDataEncoder.hash(domain, types, value);

    return this.signDigest(digest, [0]);
  }
}
