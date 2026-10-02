import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import type { Schema } from 'mongoose';

import { createLogger } from '../config/logger.js';

const log = createLogger('field-crypto');

/**
 * Encryption at rest for the most sensitive things the database holds: the
 * bKash numbers money is paid to, and people's phone numbers and addresses.
 * A copy of the database - a leaked backup, a stolen dump - then shows
 * "enc:v1:..." where those were, and is no use without the key, which lives
 * only in the server's environment.
 *
 * AES-256-GCM, so a tampered value fails to decrypt rather than decrypting to
 * nonsense. Each value has its own random nonce.
 *
 * The key is DATA_ENCRYPTION_KEY: 32 bytes, base64 (openssl rand -base64 32).
 * Without it, values are stored as they are, so a local copy needs nothing
 * set up. Values written before the key was set are read as they are and
 * encrypted the next time they are saved; `npm run encrypt:existing` does
 * them all at once. Losing the key loses these fields: keep a copy of it.
 */
const PREFIX = 'enc:v1:';

let cachedKey: { raw: string; key: Buffer | null } | null = null;
const key = (): Buffer | null => {
  const raw = process.env.DATA_ENCRYPTION_KEY?.trim() ?? '';
  if (cachedKey?.raw === raw) return cachedKey.key;
  let parsed: Buffer | null = null;
  if (raw) {
    const bytes = Buffer.from(raw, 'base64');
    if (bytes.length === 32) parsed = bytes;
    else log.error('DATA_ENCRYPTION_KEY must be 32 bytes, base64; fields are being stored unencrypted');
  }
  cachedKey = { raw, key: parsed };
  return parsed;
};

export const encryptionEnabled = (): boolean => key() !== null;

export const isEncrypted = (value: unknown): value is string => typeof value === 'string' && value.startsWith(PREFIX);

/** A value as stored: encrypted when there is a key, as it is otherwise. */
export const encryptValue = (value: unknown): unknown => {
  const secret = key();
  if (!secret || typeof value !== 'string' || value === '' || isEncrypted(value)) return value;
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, nonce);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${PREFIX}${Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64')}`;
};

/** A stored value as it was written. Plain values pass through unchanged. */
export const decryptValue = (value: unknown): unknown => {
  if (!isEncrypted(value)) return value;
  const secret = key();
  if (!secret) {
    log.error('An encrypted field was read, but DATA_ENCRYPTION_KEY is not set');
    return '';
  }
  try {
    const packed = Buffer.from(value.slice(PREFIX.length), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', secret, packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8');
  } catch (error) {
    log.error({ err: error }, 'An encrypted field could not be decrypted');
    return '';
  }
};

type Bag = Record<string, unknown>;

/** Encrypts these fields wherever an update sets them: $set, or the top level. */
const encryptUpdate = (update: Bag | null | undefined, fields: readonly string[]): void => {
  if (!update) return;
  for (const target of [update, update.$set as Bag | undefined, update.$setOnInsert as Bag | undefined]) {
    if (!target || typeof target !== 'object') continue;
    for (const field of fields) if (field in target) target[field] = encryptValue(target[field]);
  }
};

/** Decrypts these fields on what a query found: documents, plain objects, or a list. */
const decryptResult = (result: unknown, fields: readonly string[]): void => {
  const one = (doc: unknown) => {
    if (!doc || typeof doc !== 'object') return;
    const hydrated = typeof (doc as { $isNew?: unknown }).$isNew === 'boolean';
    for (const field of fields) {
      const current = hydrated ? (doc as { get: (f: string) => unknown }).get(field) : (doc as Bag)[field];
      if (!isEncrypted(current)) continue;
      if (hydrated) {
        const document = doc as { set: (f: string, v: unknown) => void; unmarkModified: (f: string) => void };
        document.set(field, decryptValue(current));
        // Read, not changed: saving it unchanged writes nothing back.
        document.unmarkModified(field);
      } else {
        (doc as Bag)[field] = decryptValue(current);
      }
    }
  };
  if (Array.isArray(result)) result.forEach(one);
  else one(result);
};

/**
 * Keeps these fields encrypted in the database and plain in the code: they
 * are encrypted on every save and update, and decrypted on every find,
 * lean or not. Filters only ever ask whether one is set, which works either way.
 */
export const encryptedFields = (schema: Schema, fields: readonly string[]): void => {
  schema.pre('save', function encryptOnSave() {
    for (const field of fields) {
      if (this.isModified(field)) this.set(field, encryptValue(this.get(field)));
    }
  });
  schema.post('save', function decryptAfterSave(doc: unknown) {
    decryptResult(doc, fields);
  });
  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function encryptOnUpdate() {
    encryptUpdate(this.getUpdate() as Bag, fields);
  });
  schema.pre('insertMany', function encryptOnInsert(_next: unknown, docs: unknown) {
    for (const doc of Array.isArray(docs) ? docs : [docs]) {
      if (doc && typeof doc === 'object') for (const field of fields) if (field in doc) (doc as Bag)[field] = encryptValue((doc as Bag)[field]);
    }
  });
  schema.post(['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete'], function decryptOnFind(result: unknown) {
    decryptResult(result, fields);
  });
};
