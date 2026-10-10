import { createHash, createPublicKey, verify, type KeyObject } from 'crypto';

/**
 * Proof that a request comes from the phone a session was started on.
 *
 * At sign-in the Android app creates a P-256 key pair in the phone's keystore,
 * where the private half can never be read out, and sends the public half. It
 * signs every later refresh with it, so a refresh token copied off the phone -
 * from a backup, a log, a rooted file system - is no use anywhere else.
 */

/** How far a signature's timestamp may be from the server's clock. */
export const DEVICE_SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

/** The public key, if it is a P-256 key in base64 SPKI form; null otherwise. */
export const parseDeviceKey = (spkiBase64: string | null | undefined): KeyObject | null => {
  if (!spkiBase64 || spkiBase64.length > 512) return null;
  try {
    const key = createPublicKey({ key: Buffer.from(spkiBase64, 'base64'), format: 'der', type: 'spki' });
    return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1' ? key : null;
  } catch {
    return null;
  }
};

/**
 * What the app signs: the request line, the time, and a hash of the refresh
 * token, one per line. Binding the token means a signature cannot be lifted
 * onto a different session's request.
 */
export const deviceSignaturePayload = (method: string, path: string, timestamp: string, refreshToken: string): string =>
  [method.toUpperCase(), path, timestamp, createHash('sha256').update(refreshToken).digest('hex')].join('\n');

export interface DeviceSignatureInput {
  deviceKey: string | null | undefined;
  /** Base64 of the DER-encoded ECDSA signature, as Android's Signature class produces it. */
  signature: string | undefined;
  /** Milliseconds since the epoch, as a string. */
  timestamp: string | undefined;
  method: string;
  path: string;
  refreshToken: string;
  now?: number;
}

/** Whether the request was signed by the session's own key, recently. */
export const verifyDeviceSignature = ({
  deviceKey,
  signature,
  timestamp,
  method,
  path,
  refreshToken,
  now = Date.now(),
}: DeviceSignatureInput): boolean => {
  const key = parseDeviceKey(deviceKey);
  if (!key || !signature || !timestamp || !/^\d{1,15}$/.test(timestamp)) return false;
  if (Math.abs(now - Number(timestamp)) > DEVICE_SIGNATURE_WINDOW_MS) return false;
  try {
    return verify(
      'sha256',
      Buffer.from(deviceSignaturePayload(method, path, timestamp, refreshToken)),
      { key, dsaEncoding: 'der' },
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
};
