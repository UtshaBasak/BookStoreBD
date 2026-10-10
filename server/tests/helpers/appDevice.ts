import { generateKeyPairSync, randomBytes, sign, type KeyObject } from 'crypto';

import type { AppDevice } from '@shared/api.js';

import { deviceSignaturePayload } from '../../utils/deviceKey.js';

/** A phone, as the Android app presents one: a keystore key pair, a name and an installation id. */
export interface TestPhone {
  device: AppDevice;
  privateKey: KeyObject;
}

export const makePhone = (name = 'Test Phone'): TestPhone => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    device: {
      publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      name,
      installId: randomBytes(24).toString('base64url'),
    },
    privateKey,
  };
};

export const REFRESH_PATH = '/api/v1/app/auth/refresh';

/** The headers the app sends with a refresh, signed by this phone's key. */
export const signedHeaders = (
  phone: TestPhone,
  refreshToken: string,
  { path = REFRESH_PATH, timestamp = Date.now() }: { path?: string; timestamp?: number } = {}
): Record<string, string> => {
  const stamp = String(timestamp);
  const signature = sign('sha256', Buffer.from(deviceSignaturePayload('POST', path, stamp, refreshToken)), phone.privateKey);
  return { 'X-Device-Timestamp': stamp, 'X-Device-Signature': signature.toString('base64') };
};
