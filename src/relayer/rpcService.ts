import { RpcService, SimulateArgs } from '@unipasswallet/relayer';
import { CustomAuthHttpError } from '@unipasswallet/smart-account-utils';
import {
  PendingExecuteCallArgs,
  SmartAccountSimulateResult,
  TokensInfo,
} from '../interface/relayer';

export class SmartAccountRpcService extends RpcService {
  override async simulate(
    args: SimulateArgs,
    headers?: object
  ): Promise<SmartAccountSimulateResult> {
    const res = await this.fetch(
      `${this.hostname}/api/v1/custom_auth/transaction/simulate`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {}),
      }
    );

    return res.text().then((text) => {
      if (!res.ok) {
        throw new CustomAuthHttpError(res.status, text);
      }

      const body = JSON.parse(text);

      if (body.statusCode !== 200) {
        throw new CustomAuthHttpError(
          body.statusCode || 500,
          body.message || text
        );
      }

      return body.data;
    });
  }

  override async sendTransaction(
    args: PendingExecuteCallArgs,
    headers?: object
  ): Promise<string> {
    const res = await this.fetch(
      `${this.hostname}/api/v1/custom_auth/transaction/send`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {}),
      }
    );

    return res.text().then((text) => {
      if (!res.ok) {
        throw new CustomAuthHttpError(res.status, text);
      }

      const body = JSON.parse(text);

      if (body.statusCode !== 200) {
        throw new CustomAuthHttpError(
          body.statusCode || 500,
          body.message || text
        );
      }

      return body.data;
    });
  }

  async getFeeTokens(headers?: object): Promise<TokensInfo> {
    const res = await this.fetch(`${this.hostname}/fee/tokens`, {
      method: 'GET',
      headers: { ...headers },
    });

    return res.text().then((text) => {
      if (!res.ok) {
        throw new CustomAuthHttpError(res.status, text);
      }

      const body = JSON.parse(text);

      if (body.statusCode !== 200) {
        throw new CustomAuthHttpError(
          body.statusCode || 500,
          body.message || text
        );
      }

      return body.data;
    });
  }
}
