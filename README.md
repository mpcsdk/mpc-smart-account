# mpc-smart-account

## Install

### Install By Npm

```bash
npm install mpcsmartaccount
```

### Install By Yarn

```bash
yarn add mpcsmartaccount
```

### Install By Pnpm

```bash
pnpm add mpcsmartaccount
```

## Create Smart Account

### Step1: Master Key Signer

Master Key Signer is the main signer for signing messages and transactions. It has to inherit the `Signer` in `ethers.js`.

**Init Signer from `idToken`**

If you want to use signers from YeehaWallet, also need to run this command:

```tsx
npm install mpcsinger
```

```tsx
import {  MpcSigner } from "mpcsinger";

/**
 * export type YeehaJwtSignerOptions = {
 *   private_key: string;                 // The App Identity registered in YeehaWallet server.
 *   userTokenFn: functin;              // The function is get user token from the Oauth service registered in the YeehaWallet server.
 * };
 */

let signer = new MpcSigner({
  private_key,
  userTokenFn
});

/**
 * export type signerInitOptions = {
 *   sendSmsCodeFn: functin;              // The function customer may send smscode
 * };
 */
signer = await signer.init({ sendSmsCodeFn });
```

### Step2 : Smart Account

```typescript
import { SmartAccount } from "mpcsmartaccount";

/**
 * export type SmartAccountOptions = {
 *  appId: string;                                  // appId registered From Backend
 *  masterKeySigner: Signer;                        // Got Master Key Signer From Step1
 *  chainOptions: {                                 // Chain Options
 *    chainId: number;
 *    rpcUrl: string;                               // The Rpc Url matched the chainId
 *    relayerUrl?: string;                          // relayer url, default official relayer
 *  }[];
 *  fetch?: typeof fetch;
 *  unipassServerUrl?: string;
 * };
 */
const smartAccount = new SmartAccount({
  masterKeySigner: signer,
  appId,
  chainOptions,
});

await smartAccount.init({ chainId }); // init with active chain id. Notice that the chainId must be included in the `rpcUrlList`.
```

## Send Transaction

### Step1 Generate Transaction

```typescript
const tx = {
  to, // To Address
  data, // Transaction Data
  value, // The value transferred to `To Address`
};
```

### Step2 Got Fee Options By Simulating Transaction

```typescript
const {
  isFeeRequired, // whether required fee for the transaction
  feeOptions: FeeOptions, // the fee options
} = await smartAccount.simulateTransaction(tx);
```

### Step3 Validate Whether Fee is sufficient

```typescript
import { constants } from "ethers";

if (isFeeRequired) {
  const feeOption; // Select Fee Option from fee options Got From `Step1`
  let balance;
  // Validate Native Token
  if (feeOption.token === constants.ZeroAddress) {
    balance = await smartAccount
      .getProvider()
      .getBalance(await smartAccount.getAddress());

    // Validate ERC20 Token
  } else {
    const erc20Interface = [
      "function balanceOf(address _owner) public view returns (uint256 balance)",
    ];
    const erc20Contract = new Contract(
      feeOption.token,
      new ethers.utils.Interface(ERC20Interface),
      smartAccount.getProvider()
    );
    balance = erc20Contract.balanceOf(await smartAccount.getAddress());
  }

  if (balance.le(feeOptions.amount)) {
    console.error("Fee Balance Not Enough");
  }
}
```

Notice that if there is a transaction involving fee tokens, the validating result may not be accurate.

### Step4 Sending Transaction With Specific Fee Option

```typescript
if (isFeeRequired) {
  const feeOption;
  const response = await smartAccount.sendTransaction(tx, {
    fee: feeOption,
  }); // Send Transaction
  const receipt = await response.wait(); // Got Transaction Receipt Or Wait For at most 60 seconds
  // const receipt = await response.wait(1, 60);
} else {
  // Not Need Fee
  const response = await smartAccount.sendTransaction(tx); // Send Transaction
  const receipt = await response.wait(); // Got Transaction Receipt
}
```

## Sign And Verify Message

```typescript
import { verifyMessage } from "@unipasswallet/smart-account-validator";

const message; // The Message to Sign
const signature = await smartAccount.signMessage(message); // Sign message
const isValid = await verifyMessage({
  // Verify Message
  message,
  signature,
  provider,
  address: await smartAccount.getAddress(),
});
```

## Sign And Verify Typed Data

```typescript
import { verifyTypedData } from "@unipasswallet/smart-account-validator";

const typedData; // The Typed Data to Sign
// Sign V4 Typed Data
const signature = await smartAccount.signTypedData(
  typedData.domain,
  typedData.types,
  typedData.message
); // Sign message
// Verify V4 Typed Data
const isValid = await verifyTypedData({
  // Verify Message
  typedData,
  signature,
  provider,
  address: await smartAccount.getAddress(),
});
```

## Destroy Smart Account

```typescript
await smartAccount.destroy();
```

Notice that if you are using `UniPassJwtSigner` and pass the `storage`, please run `destroy` method to avoid security issues.

## Switch new Smart Account

```typescript
// Destroy Old Smart Account
await oldSmartAccount.destroy();

// Reconstruct a new Smart Account
const newSmartAccount = new SmartAccount({
  masterKeySigner: signer,
  appId,
  chainOptions,
});

await newSmartAccount.init({ chainId });
```

## Methods of `SmartAccount`

The instance of `SmartAccount` returns the following functions:

- Get Smart Account Info
  - `getAddress()` : returns the address of your smart account.
  - `isDeployed()` : returns the result whether your smart account is deployed in current chain.
  - `getProvider()`: returns current provider that your smart account is using.
  - `getChainId()`: returns current chain id of your smart account.
- `sendTransaction()`: returns the response of transaction
- `signMessage()`: returns the signature
- `switchChain()`: switch active chain and returns smart account with new chain.

## Get Smart Account Info (Finished)

`getAddress()`

This returns the address of your smart account.

```tsx
const address = await smartAccount.getAddress();
```

`isDeployed()`

This returns the result whether your smart account is deployed in current chain.

```tsx
const isDeployed = await smartAccount.isDeployed();
```

`getProvider()`

This returns current provider that your smart account is using.

```tsx
const provider = smartAccount.getProvider();
```

`getChainId()`

This returns current chain of your smart account.

```tsx
const chainId = smartAccount.getChainId();
```

`switchChain()`

Switch active chain and returns smart account with new chain.

```tsx
smartAccount = await smartAccount.switchChain(chainId);
```
