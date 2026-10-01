import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const getEncryptionKey = (): Buffer => {
  const configuredKey = process.env.CONFIG_ENCRYPTION_KEY?.trim();
  if (!configuredKey) throw new Error('CONFIG_ENCRYPTION_KEY must be set to a 32-byte key before using stored data-source credentials.');
  const key = /^[0-9a-fA-F]{64}$/.test(configuredKey)
    ? Buffer.from(configuredKey, 'hex')
    : Buffer.from(configuredKey, 'base64');
  if (key.length !== 32) throw new Error('CONFIG_ENCRYPTION_KEY must encode exactly 32 bytes as 64 hex characters or base64.');
  return key;
};

export const encryptConfig = (plainText: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
};

export const decryptConfig = (encryptedText: string): string => {
  const [version, encodedIv, encodedTag, encodedCipherText, ...extra] = encryptedText.split(':');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCipherText || extra.length > 0) {
    throw new Error('Stored data-source configuration has an unsupported encryption format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(encodedIv, 'base64'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCipherText, 'base64')),
    decipher.final()
  ]).toString('utf8');
};