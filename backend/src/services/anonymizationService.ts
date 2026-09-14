import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import type { DomainContext } from '@ontofabric/shared/types.js';
import type { UserRole } from '../middleware/abacMiddleware.js';

const CACHE_TTL_MS = 15 * 60 * 1000;
const encryptionKey = createHash('sha256')
  .update(process.env.ANONYMIZATION_CACHE_KEY ?? randomBytes(32).toString('hex'))
  .digest();

type EncryptedRedaction = {
  iv: string;
  authTag: string;
  encryptedMap: string;
  domain: DomainContext;
  expiresAt: number;
};

export type AnonymizationResult = {
  sanitizedText: string;
  redactionMap: Record<string, string>;
  redactionId: string;
};

const redactionCache = new Map<string, EncryptedRedaction>();

const secureStore = (redactionMap: Record<string, string>, domain: DomainContext): string => {
  const redactionId = randomBytes(18).toString('base64url');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encryptedMap = Buffer.concat([
    cipher.update(JSON.stringify(redactionMap), 'utf8'),
    cipher.final()
  ]);
  redactionCache.set(redactionId, {
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    encryptedMap: encryptedMap.toString('base64'),
    domain,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
  return redactionId;
};

const secureRead = (entry: EncryptedRedaction): Record<string, string> => {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(entry.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(entry.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(entry.encryptedMap, 'base64')),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(plaintext) as Record<string, string>;
};

const maskMatches = (
  text: string,
  expression: RegExp,
  placeholder: string,
  redactionMap: Record<string, string>,
  counters: Map<string, number>
): string => text.replace(expression, (match) => {
  const count = (counters.get(placeholder) ?? 0) + 1;
  counters.set(placeholder, count);
  redactionMap[`${placeholder}#${count}`] = match;
  return placeholder;
});

export const anonymizeText = async (rawText: string, domain: DomainContext): Promise<AnonymizationResult> => {
  const redactionMap: Record<string, string> = {};
  const counters = new Map<string, number>();
  let sanitizedText = rawText;

  const patterns: Array<[RegExp, string]> = [
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]'],
    [/(?:(?:SSN|Social Security(?: Number)?|Tax ID|TIN)\s*[:#-]?\s*)?\b\d{3}-\d{2}-\d{4}\b/gi, '[REDACTED_SSN]'],
    [/(?:(?:MRN|Medical Record(?: Number)?|Patient ID)\s*[:#-]?\s*)\b[A-Z]{0,4}[- ]?\d{5,12}\b/gi, '[REDACTED_MRN]'],
    [/(?:(?:Card|Credit Card|CC)\s*[:#-]?\s*)?\b(?:\d[ -]*?){13,19}\b/gi, '[REDACTED_CARD]'],
    [/(?:(?:Phone|Mobile|Tel(?:ephone)?)\s*[:#-]?\s*)?(?:\+?\d{1,3}[ .-]?)?(?:\(?\d{3}\)?[ .-]?)\d{3}[ .-]?\d{4}\b/gi, '[REDACTED_PHONE]'],
    [/(?:(?:Full Name|Patient Name|Customer Name|Employee Name|Name)\s*[:#-]\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g, '[REDACTED_NAME]']
  ];

  patterns.forEach(([expression, placeholder]) => {
    sanitizedText = maskMatches(sanitizedText, expression, placeholder, redactionMap, counters);
  });

  const redactionId = secureStore(redactionMap, domain);
  for (const [cacheId, entry] of redactionCache) {
    if (entry.expiresAt <= Date.now()) redactionCache.delete(cacheId);
  }
  return { sanitizedText, redactionMap, redactionId };
};

export const rehydrateText = (sanitizedText: string, redactionId: string, role: UserRole): string => {
  if (role !== 'ADMIN') throw new Error('Only ADMIN users may rehydrate anonymized content.');
  const entry = redactionCache.get(redactionId);
  if (!entry || entry.expiresAt <= Date.now()) {
    redactionCache.delete(redactionId);
    throw new Error('The anonymization record is unavailable or expired.');
  }
  const redactionMap = secureRead(entry);
  const originalsByPlaceholder = new Map<string, string[]>();
  Object.entries(redactionMap).forEach(([key, original]) => {
    const placeholder = key.slice(0, key.lastIndexOf('#'));
    originalsByPlaceholder.set(placeholder, [...(originalsByPlaceholder.get(placeholder) ?? []), original]);
  });
  return [...originalsByPlaceholder.entries()].reduce((text, [placeholder, originals]) => {
    let index = 0;
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escapedPlaceholder, 'g'), () => originals[index++] ?? placeholder);
  }, sanitizedText);
};

export const clearAnonymizationCache = (): void => {
  redactionCache.clear();
};
