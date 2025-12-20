/**
 * Frontend PII Scrubber
 * 
 * Mirrors the logic in portfolio_src/core/reporter.py for frontend-only crashes.
 */

export const PII_PATTERNS = [
  { pattern: /[A-Z]{2}[0-9]{2}(?:\s?[A-Z0-9]){12,30}/g, replacement: '[IBAN]' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
  { pattern: /\+?[0-9]{1,4}[-.\s]?\(?[0-9]{1,3}?\)?[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9}/g, replacement: '[PHONE]' },
  { pattern: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, replacement: '[TOKEN]' },
  { pattern: /(?:key|secret|password|token|auth|bearer)\s*[:=]\s*['"]?[A-Za-z0-9-_]{16,}['"]?/gi, replacement: '[SENSITIVE_DATA]' },
];

export const ISIN_PATTERN = /\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/g;

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

export function scrubText(text: string): string {
  if (!text) return '';
  
  let scrubbed = text;
  
  for (const { pattern, replacement } of PII_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  
  scrubbed = scrubbed.replace(ISIN_PATTERN, (match) => {
    return `[ASSET_HASH_${simpleHash(match)}]`;
  });
  
  return scrubbed;
}

export function scrubObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? scrubText(obj) : obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(scrubObject);
  }
  
  const scrubbed: any = {};
  const SENSITIVE_KEYS = ['quantity', 'value', 'price', 'cost', 'pnl', 'amount', 'balance'];
  
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some(s => key.toLowerCase().includes(s))) {
      scrubbed[key] = '[REDACTED_VALUE]';
      continue;
    }
    
    scrubbed[key] = scrubObject(value);
  }
  
  return scrubbed;
}
