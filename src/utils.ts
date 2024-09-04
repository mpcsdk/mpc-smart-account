import { RoleWeight, SignType } from 'mpc-keys';
import { Signer, constants } from 'ethers';
import { BytesLike, Interface, solidityPack } from 'ethers/lib/utils';
import { UNIPASS_FACTORY_ABI, UNIPASS_FACTORY_ADDRESS } from './unipassFactory';
import { getWalletCode } from '@unipasswallet/utils';
import { MAINNET_UNIPASS_WALLET_CONTEXT } from '@unipasswallet/network';
import { CallType, Transaction } from '@unipasswallet/transactions';

export const DEFAULT_MASTER_KEY_ROLE_WEIGHT = new RoleWeight(100, 100, 0);

export async function ethSign(message: string, key: Signer): Promise<string> {
  return key.signMessage(message);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function eip712Sign(
  _hash: BytesLike,
  _signer: Signer
): Promise<string> {
  return _signer.signMessage(_hash);
}

export async function sign(
  hash: string,
  key: Signer,
  signType: SignType
): Promise<string> {
  //ethers的Signer需要改为自己的Signer
  let sig;
  switch (signType) {
    case SignType.EIP712Sign: {
      sig = await eip712Sign(hash, key);
      break;
    }

    case SignType.EthSign: {
      sig = await ethSign(hash, key);
      break;
    }

    default: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const error: any = new Error(`Invalid SignTyp: ${signType}`);
      error.signType = signType;
      throw error;
    }
  }
  if (!sig) {
    throw 'sig is null';
  }
  return solidityPack(['bytes', 'uint8'], [sig, signType]);
}

export function getCustomAuthDeployTransaction(
  appId: string,
  keysetHash: BytesLike
): Transaction {
  const initCode = getWalletCode(MAINNET_UNIPASS_WALLET_CONTEXT.moduleMain);
  const data = new Interface(UNIPASS_FACTORY_ABI).encodeFunctionData('deploy', [
    keysetHash,
    initCode,
    appId,
  ]);

  return {
    _isUnipassWalletTransaction: true,
    callType: CallType.Call,
    data,
    revertOnError: true,
    value: constants.Zero,
    gasLimit: constants.Zero,
    target: UNIPASS_FACTORY_ADDRESS,
  };
}
