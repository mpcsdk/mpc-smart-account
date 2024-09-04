/* eslint-disable no-await-in-loop */
import {
  BigNumber,
  Signer,
  TypedDataDomain,
  TypedDataField,
  constants,
  providers,
} from 'ethers';
import {
  Interface,
  _TypedDataEncoder,
  concat,
  defaultAbiCoder,
  hexlify,
  solidityPack,
} from 'ethers/lib/utils';
import { KeySecp256k1, Keyset, SignType, KeySecp256k1Wallet } from 'mpc-keys';
import {
  ChainOptions,
  ERC6492_DETECTION_SUFFIX,
  FeeOption,
  SendTransactionOptions,
  SimulateResult,
  SimulateTransactionOptions,
  SmartAccountInitOptions,
  SmartAccountOptions,
  SmartAccountStatus,
} from './interface/smartAccount';
import {
  BundledExecuteCall,
  MainExecuteCall,
  RawBundledExecuteCall,
  RawMainExecuteCall,
  RawMainExecuteTransaction,
} from 'mpc-wallet';
import * as CrossFetch from 'cross-fetch';
import {
  DEFAULT_MASTER_KEY_ROLE_WEIGHT,
  getCustomAuthDeployTransaction,
  sign,
} from './utils';
import { CallTxBuilder } from '@unipasswallet/transaction-builders';
import { MAINNET_UNIPASS_WALLET_CONTEXT } from '@unipasswallet/network';
import { erc20 } from '@unipasswallet/abi';
import {
  Transaction,
  Transactionish,
  toTransaction,
} from '@unipasswallet/transactions';
import {
  CreationCode,
  ModuleMainInterface,
  SingletonFactoryAddress,
  SingletonFactoryInterface,
} from '@unipasswallet/utils';
import {
  createInvalidMasterKeySignerError,
  createInvalidProviderError,
  createSimulatingTransactionError,
  UnipassClient,
  createInvalidParams,
  createNotSupportChainError,
  DEFAULT_UNIPASS_SERVER_URL,
  createUnsupportedOperation,
  createSendingTransactionError,
} from '@unipasswallet/smart-account-utils';
import { SmartAccountRelayer } from './relayer';
import { FreeFeeOption, TokensInfo } from './interface/relayer';
import { SmartAccountWallet } from './smartAccountWallet';
import { SmartAccountResponse } from './interface';
import { FeeActionPointSig } from '@unipasswallet/relayer';
const DEFAULT_MASTER_KEY_INDEX = 0;
const DEFAULT_TIMEOUT = 60;

export class SmartAccount {
  private relayer!: SmartAccountRelayer;

  private provider!: providers.Provider;

  private masterKeySigner!: Signer;

  private masterKeyIndex!: number;

  private keyset?: Keyset;

  private address?: string;

  private wallet!: SmartAccountWallet;

  private status: SmartAccountStatus;

  private chainId!: number;

  private appId: string;

  private unipassClient: UnipassClient;

  private chainOptions: Record<number, ChainOptions>;

  /**
   *
   * @param options The constructor options
   *                options.masterKeySigner   The main signer for signing messages and transactions
   *                options.appId             The appId From UniPass Custom Backend
   *                options.rpcUrlList           Record<chainId, rpcUrl>, The list of rpc urls.
   *                options.relayerUrlList       Record<chainId, relayerUrl> | undefined, The list of relayer Urls.
   *                                          If it is undefined, got relayer url from default configs.
   *                options.env               Environment.Test | Environment.Prod, running environment, default Environment.Prod.
   *                options.unipassServerUrl  Not required. UniPass Backend Url.
   */
  constructor(options: SmartAccountOptions) {
    const {
      masterKeySigner,
      chainOptions,
      appId,
      fetch = CrossFetch.fetch,
      unipassServerUrl,
      keysetJson,
      address,
    } = options;

    this.masterKeySigner = masterKeySigner;
    this.masterKeyIndex = DEFAULT_MASTER_KEY_INDEX;
    this.status = SmartAccountStatus.Uninitialized;
    this.appId = appId;
    this.keyset = keysetJson ? Keyset.fromJson(keysetJson) : undefined;
    this.address = address;

    if (unipassServerUrl) {
      this.unipassClient = new UnipassClient(unipassServerUrl, fetch);
    } else {
      const unipassServerUrl = DEFAULT_UNIPASS_SERVER_URL;
      this.unipassClient = new UnipassClient(unipassServerUrl, fetch);
    }

    this.chainOptions = {};
    chainOptions.forEach((chainOption) => {
      this.chainOptions[chainOption.chainId] = chainOption;
    });
  }

  async init({ chainId }: SmartAccountInitOptions): Promise<SmartAccount> {
    this.canBeInitialized();

    const chainOptions = await Promise.all(
      Object.values(this.chainOptions).map(
        async ({ chainId, rpcUrl, relayerUrl }) => {
          if (!relayerUrl) {
            // eslint-disable-next-line no-param-reassign
            relayerUrl = (await this.unipassClient.config(this.appId, chainId))
              .unipassRelayerUrl;
          }
          return {
            chainId,
            rpcUrl,
            relayerUrl,
          };
        }
      )
    );
    chainOptions.forEach((chainOption) => {
      this.chainOptions[chainOption.chainId] = chainOption;
    });

    const relayerUrl = this.selectRelayerUrl(chainId);

    const provider = this.selectProvider(chainId);

    const relayer = new SmartAccountRelayer(
      relayerUrl,
      MAINNET_UNIPASS_WALLET_CONTEXT,
      provider,
      this.appId,
      this.unipassClient.fetch
    );

    let masterKeyAddress;

    try {
      masterKeyAddress = await this.masterKeySigner.getAddress();
    } catch (err) {
      throw createInvalidMasterKeySignerError(`Gor Address Failed: ${err}`);
    }

    if (this.keyset) {
      const masterKey = this.keyset.keys[DEFAULT_MASTER_KEY_INDEX];
      const masterKeySigner = new KeySecp256k1(
        masterKeyAddress,
        masterKey.roleWeight,
        SignType.EthSign,
        async (digestHash) =>
          sign(digestHash, this.masterKeySigner, SignType.EthSign)
      );

      if (KeySecp256k1.isKeySecp256k1(masterKey)) {
        if (
          masterKey.address.toLowerCase() !== masterKeyAddress.toLowerCase()
        ) {
          throw createInvalidMasterKeySignerError(
            `Invalid Keyset Json With MasterKey: ${masterKey.address}`
          );
        }
        this.keyset.keys[0] = masterKeySigner;
      } else if (KeySecp256k1Wallet.isKeySecp256k1Wallet(masterKey)) {
        if (
          masterKey.wallet.address.toLowerCase() !==
          masterKeyAddress.toLowerCase()
        ) {
          throw createInvalidMasterKeySignerError(
            `Invalid Keyset Json With MasterKey: ${masterKey.wallet.address}`
          );
        }
        this.keyset.keys[0] = masterKeySigner;
      } else {
        throw createInvalidMasterKeySignerError(`Invalid Keyset Json`);
      }
    } else {
      const masterKeySigner = new KeySecp256k1(
        masterKeyAddress,
        DEFAULT_MASTER_KEY_ROLE_WEIGHT,
        SignType.EthSign,
        async (digestHash) =>
          sign(digestHash, this.masterKeySigner, SignType.EthSign)
      );
      const masterKeySigner712 = new KeySecp256k1(
        masterKeyAddress,
        DEFAULT_MASTER_KEY_ROLE_WEIGHT,
        SignType.EIP712Sign,
        async (digestHash) =>
          sign(digestHash, this.masterKeySigner, SignType.EIP712Sign)
      );
      this.keyset = new Keyset([masterKeySigner, masterKeySigner712]);
    }

    this.wallet = SmartAccountWallet.create({
      keyset: this.keyset,
      provider,
      relayer,
      context: MAINNET_UNIPASS_WALLET_CONTEXT,
      address: this.address,
    });
    this.chainId = chainId;
    this.provider = provider;
    this.relayer = relayer;

    // this.register();

    this.status = SmartAccountStatus.Initialized;

    return this;
  }

  private async updateStatus() {
    try {
      await this.unipassClient.updateStatus(
        this.appId,
        this.chainId,
        await this.getAddress()
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[UniPass Update Status]: ', e);
    }
  }

  getStatus(): SmartAccountStatus {
    return this.status;
  }

  /**
   *
   * @returns The Address Of the Smart Account
   */
  async getAddress(): Promise<string> {
    this.checkIsInitialized();
    return this.wallet.getAddress();
  }

  /**
   *
   * @returns Whether The Smart Account is deployed in the current chain.
   */
  async isDeployed(): Promise<boolean> {
    const address = await this.getAddress();

    try {
      return (await this.provider.getCode(address)) !== '0x';
    } catch (err) {
      throw createInvalidProviderError(`Provider Got Code Failed: ${err}`);
    }
  }

  getProvider(): providers.Provider {
    return this.provider;
  }

  getChainId(): number {
    return this.chainId;
  }

  async getNonce(): Promise<BigNumber> {
    const { nonce } = await this.getNonceInfo();

    return nonce;
  }

  /**
   *
   * @returns isDeployed: Wether Wallet is Deployed in the chain
   *          nonce: the nonce of wallet transaction
   */
  private async getNonceInfo(): Promise<{
    isDeployed: boolean;
    nonce: BigNumber;
  }> {
    this.checkIsInitialized();

    const noncePromise = async () => {
      const contract = this.wallet.getContract().connect(this.provider);

      try {
        return await contract.getNonce();
      } catch (error) {
        return error;
      }
    };

    try {
      const [nonceResult, isDeployed] = await Promise.all([
        noncePromise(),
        this.isDeployed(),
      ]);

      let nonce: BigNumber;

      if (isDeployed && BigNumber.isBigNumber(nonceResult)) {
        nonce = nonceResult;
      } else if (isDeployed) {
        throw nonceResult;
      } else {
        nonce = constants.Zero;
      }

      return {
        isDeployed,
        nonce,
      };
    } catch (err) {
      throw createInvalidProviderError(`Got Nonce Failed: ${err}`);
    }
  }

  private async simulateExecuteCall(
    execute: RawBundledExecuteCall | RawMainExecuteCall,
    feeAddress?: string
  ): Promise<SimulateResult> {
    let simulateResult;

    try {
      simulateResult = await this.wallet.simulateExecute(execute, feeAddress);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const error = err && err.message ? err.message : JSON.stringify(err);

      throw createSimulatingTransactionError(
        `Simulating Transaction Failed: ${error}`
      );
    }

    const { feeTokens, discount, feeReceiver, isFeeRequired, gasPrice } =
      simulateResult;

    if (isFeeRequired) {
      const feeOptions = feeTokens.map((feeToken) => {
        const {
          token,
          tokenPrice,
          nativeTokenPrice,
          gasUsed,
          name,
          symbol,
          decimals = 18,
        } = feeToken;
        const amount = BigNumber.from(gasPrice)
          .mul(gasUsed)
          .mul(Math.ceil(nativeTokenPrice * 10 ** 8))
          .mul(discount)
          .div(Math.ceil(tokenPrice * 10 ** 8))
          .div(100)
          .div(10 ** (18 - decimals))
          .add(1);

        return {
          token,
          name,
          symbol,
          decimals,
          amount,
          to: feeReceiver,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          error: (feeToken as any).error,
        };
      });

      return {
        feeOptions,
        isFeeRequired,
      };
    }

    return {
      feeOptions: [],
      isFeeRequired,
    };
  }

  /**
   * @description simulating transaction to get fee and fee amount
   * @param tx the transaction to simulate
   * @param options simulating options
   *                options.feeToken the address of the fee token, if the address is zero, the fee token is native token.
   * @returns
   */
  async simulateTransaction(
    tx: Transactionish,
    options?: SimulateTransactionOptions
  ): Promise<SimulateResult> {
    return this.simulateTransactionBatch([tx], options);
  }

  /**
   * @description simulating transaction to get fee and fee amount
   * @param tx the transaction to simulate
   * @param options simulating options
   *                options.feeToken the address of the fee token, if the address is zero, the fee token is native token.
   * @returns
   */
  async simulateTransactionBatch(
    txs: Transactionish[],
    options?: SimulateTransactionOptions
  ): Promise<SimulateResult> {
    const newTxs = txs.map((tx) => {
      const newTx = tx;
      newTx.gasLimit = tx.gasLimit || constants.Zero;

      const unipassTx = toTransaction(newTx);
      unipassTx.revertOnError = true;

      return unipassTx;
    });

    const { feeToken: feeAddress } = options || {};

    const { isDeployed, nonce } = await this.getNonceInfo();

    const execute: RawMainExecuteCall | RawBundledExecuteCall =
      await this.generateExecuteCall(newTxs, nonce, isDeployed);

    return this.simulateExecuteCall(execute, feeAddress);
  }

  private async generateExecuteCall(
    txs: Transaction[],
    nonce: BigNumber,
    isDeployed: boolean,
    feeTx?: Transaction
  ): Promise<RawBundledExecuteCall | RawMainExecuteCall> {
    //transaction step3
    const transactions = [];

    if (txs.length === 1) {
      transactions.push(txs[0]);
    } else {
      const masterKey = this.wallet.keyset.keys[this.masterKeyIndex];
      const data = ModuleMainInterface.encodeFunctionData('selfExecute', [
        masterKey.roleWeight.ownerWeight,
        masterKey.roleWeight.assetsOpWeight,
        masterKey.roleWeight.guardianWeight,
        txs,
      ]);

      transactions.push(
        new CallTxBuilder(
          true,
          constants.Zero,
          await this.getAddress(),
          constants.Zero,
          data
        ).build()
      );
    }

    if (feeTx) {
      transactions.push(feeTx);
    }

    const mainExecute = new RawMainExecuteCall(transactions, nonce.add(1), [
      this.masterKeyIndex,
    ]);

    if (!isDeployed) {
      const deployedTx = getCustomAuthDeployTransaction(
        this.appId,
        this.wallet.keyset.hash()
      );

      const execute = new RawBundledExecuteCall([
        deployedTx,
        new RawMainExecuteTransaction({
          rawExecuteCall: mainExecute,
          target: this.wallet.address,
        }),
      ]);
      return execute;
    }

    return mainExecute;
  }

  /**
   * @description sending transaction
   * @param tx the transactions to send
   * @param options the sending transaction options, if options is undefined, smart account
   *                will not send fee to relayer.
   *                  * options.fee: specify the fee token and amount to send transaction
   *                  * options.freeFeeOption: the params to free fee
   * @returns Transaction response type of `ethers.js`. Note that the hash of response is the
   *          hash from relayer but not from chain.
   */
  async sendTransaction(
    tx: Transactionish,
    options?: SendTransactionOptions
  ): Promise<SmartAccountResponse> {
    //transaction step1
    return this.sendTransactionBatch([tx], options);
  }

  /**
   * @description sending batch transactions
   * @param txs the transactions to send
   * @param options the sending transaction options, if options is undefined, smart account
   *                will not send fee to relayer.
   *                  * options.fee: specify the fee token and amount to send transaction
   *                  * options.freeFeeOption: the params to free fee
   * @returns Transaction response type of `ethers.js`. Note that the hash of response is the
   *          hash from relayer but not from chain.
   */
  async sendTransactionBatch(
    txs: Transactionish[],
    options?: SendTransactionOptions
  ): Promise<SmartAccountResponse> {
    //transaction step2
    this.checkIsInitialized();

    const { fee, freeFeeOption } = options || {};

    const newTxs = txs.map((tx) => {
      const newTx = tx;
      newTx.gasLimit = tx.gasLimit || constants.Zero;

      const callTx = toTransaction(newTx);
      callTx.revertOnError = true;
      return toTransaction(callTx);
    });

    const feeTx = this.generateFeeTx(fee);

    const { isDeployed, nonce } = await this.getNonceInfo();
    // isDeployed-false  feeTx-undefind

    const execute = await this.generateExecuteCall(
      newTxs,
      nonce,
      isDeployed,
      feeTx
    );

    this.updateStatus();

    try {
      return await this.wallet.sendTransactions(
        execute,
        undefined,
        freeFeeOption
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const error = err && err.message ? err.message : JSON.stringify(err);

      if (error.includes('sig is null')) {
        throw 'Sending Transaction Failed: signature is null';
      } else {
        throw createSendingTransactionError(
          `Sending Transaction Failed: ${error}`
        );
      }
    }
  }

  async signTransactions(
    txs: Transactionish[],
    options?: SendTransactionOptions
  ) {
    this.checkIsInitialized();

    const { fee } = options || {};

    const newTxs = txs.map((tx) => {
      const newTx = tx;
      newTx.gasLimit = tx.gasLimit || constants.Zero;

      const callTx = toTransaction(newTx);
      callTx.revertOnError = true;

      return toTransaction(callTx);
    });

    const feeTx = this.generateFeeTx(fee);

    const { isDeployed, nonce } = await this.getNonceInfo();

    const execute = await this.generateExecuteCall(
      newTxs,
      nonce,
      isDeployed,
      feeTx
    );

    return this.wallet.signTransactions(execute);
  }

  async sendSignedTransactions(signedTransactions: {
    execute: MainExecuteCall | BundledExecuteCall;
    chainId?: number;
    nonce?: BigNumber;
    feeActionPointSig?: FeeActionPointSig | undefined;
    freeFeeOption?: FreeFeeOption | undefined;
  }) {
    // eslint-disable-next-line prefer-const
    let { execute, chainId, nonce, feeActionPointSig, freeFeeOption } =
      signedTransactions;

    if (!nonce) {
      nonce = await this.getNonce();
    }

    return this.wallet.sendSmartSignedTransactions({
      execute,
      chainId: chainId || this.chainId,
      nonce,
      feeActionPointSig,
      freeFeeOption,
    });
  }

  getSigner(): Signer {
    return this.masterKeySigner;
  }

  async waitTransactionByReceipt(
    txHash: string,
    _confirmations: number,
    chainId?: number,
    timeout: number = DEFAULT_TIMEOUT
  ) {
    let wallet;
    if (chainId) {
      const relayerUrl = this.selectRelayerUrl(chainId);
      const provider = this.selectProvider(chainId);

      const relayer = new SmartAccountRelayer(
        relayerUrl,
        MAINNET_UNIPASS_WALLET_CONTEXT,
        provider,
        this.appId,
        this.unipassClient.fetch
      );

      wallet = SmartAccountWallet.create({
        keyset: this.wallet.keyset,
        provider,
        relayer,
        context: MAINNET_UNIPASS_WALLET_CONTEXT,
      });
    } else {
      wallet = this.wallet;
    }

    return wallet.waitForTransaction(txHash, _confirmations || 1, timeout);
  }

  private generateFeeTx(fee?: FeeOption): Transaction | undefined {
    if (fee) {
      const { to, amount, token } = fee;

      if (amount.gt(0)) {
        if (token === constants.AddressZero) {
          return new CallTxBuilder(
            true,
            constants.Zero,
            to,
            amount,
            '0x'
          ).build();
        }

        return new CallTxBuilder(
          true,
          constants.Zero,
          token,
          constants.Zero,
          new Interface(erc20.abi).encodeFunctionData('transfer', [to, amount])
        ).build();
      }
    }

    return undefined;
  }

  /**
   *
   * @returns Tokens allowed to pay for fee
   */
  async getTokens(): Promise<TokensInfo> {
    return this.relayer.getFeeTokens();
  }

  switchChain(chainId: number): SmartAccount {
    this.checkIsInitialized();

    const relayerUrl = this.selectRelayerUrl(chainId);
    const provider = this.selectProvider(chainId);

    const relayer = new SmartAccountRelayer(
      relayerUrl,
      MAINNET_UNIPASS_WALLET_CONTEXT,
      provider,
      this.appId,
      this.unipassClient.fetch
    );

    this.chainId = chainId;
    this.relayer = relayer;
    this.provider = provider;

    this.wallet = SmartAccountWallet.create({
      keyset: this.wallet.keyset,
      provider: this.provider,
      relayer: this.relayer,
      context: MAINNET_UNIPASS_WALLET_CONTEXT,
    });

    return this;
  }

  private selectRelayerUrl(chainId: number): string {
    const { relayerUrl } = this.chainOptions[chainId] || {};

    if (!relayerUrl) {
      throw createNotSupportChainError(chainId);
    }

    return relayerUrl;
  }

  private selectProvider(chainId: number): providers.StaticJsonRpcProvider {
    const { rpcUrl } = this.chainOptions[chainId] || {};

    if (!rpcUrl) {
      throw createInvalidParams(
        `Not Get Rpc Url For ChainId[${chainId}] From Rpc List`
      );
    }

    const provider = new providers.StaticJsonRpcProvider(rpcUrl);

    return provider;
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
    const hash = _TypedDataEncoder.hash(domain, types, value);

    const data = JSON.stringify({ hash, types, value, domain });
    return this.signDigest712(data);
  }
  async signDigest712(digest: string): Promise<string> {
    this.checkIsInitialized();

    if (await this.isDeployed()) {
      return this.wallet.signDigest(digest, [1]);
    }
    return hexlify(
      concat([
        defaultAbiCoder.encode(
          ['address', 'bytes', 'bytes'],
          [
            SingletonFactoryAddress,
            this.factoryCalldata(),
            await this.wallet.signDigest(digest, [1]),
          ]
        ),
        ERC6492_DETECTION_SUFFIX,
      ])
    );
  }
  /**
   * @description sign digest by [ERC6492](https://eips.ethereum.org/EIPS/eip-6492)
   * @param digest
   * @returns
   */
  async signDigest(digest: string): Promise<string> {
    this.checkIsInitialized();

    if (await this.isDeployed()) {
      return this.wallet.signDigest(digest);
    }

    return hexlify(
      concat([
        defaultAbiCoder.encode(
          ['address', 'bytes', 'bytes'],
          [
            SingletonFactoryAddress,
            this.factoryCalldata(),
            await this.wallet.signDigest(digest),
          ]
        ),
        ERC6492_DETECTION_SUFFIX,
      ])
    );
  }

  private factoryCalldata(): string {
    return SingletonFactoryInterface.encodeFunctionData('deploy', [
      solidityPack(
        ['bytes', 'uint256'],
        [CreationCode, this.wallet.context.moduleMain]
      ),
      this.wallet.keyset.hash(),
    ]);
  }

  /**
   *
   * @param message The message to signed
   * @returns
   */
  async signMessage(message: string): Promise<string> {
    return this.signDigest(message);
  }

  private canBeInitialized() {
    switch (this.status) {
      case SmartAccountStatus.Destroyed: {
        throw createUnsupportedOperation(
          `The smartAccount instance has been destroyed, please reinitialize a new smartAccount`
        );
      }

      default:
    }
  }

  private checkIsInitialized() {
    //this.status 1
    switch (this.status) {
      case SmartAccountStatus.Destroyed: {
        throw createUnsupportedOperation(
          `The smartAccount instance has been destroyed, please reinitialize a new smartAccount`
        );
      }

      case SmartAccountStatus.Uninitialized: {
        throw createUnsupportedOperation(
          `The smartAccount instance has not been initialized, please initialize the smartAccount`
        );
      }

      default:
    }
  }

  async destroy(): Promise<SmartAccount> {
    this.canBeInitialized();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signer = this.masterKeySigner as any;

    if (signer._isUniPassJwtSigner && signer.clear) {
      await signer.clear();
    }

    this.status = SmartAccountStatus.Destroyed;

    return this;
  }
}
