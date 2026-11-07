/**
 * Generate a UUID v4 compatible string without using crypto dependency
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where x is any hexadecimal digit and y is one of 8, 9, A, or B
 * 
 * IMPORTANT: This implementation uses Math.random() which is NOT cryptographically secure.
 * For security-sensitive applications or public-facing IDs, use crypto.randomUUID() instead.
 * This implementation is suitable for internal IDs, test environments, and non-security contexts.
 */
export function generateUUID(): string {
  const hex = '0123456789abcdef';
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  
  return Array.from(template, ch => {
    if (ch === 'x') {
      return hex[Math.floor(Math.random() * 16)];
    }
    if (ch === 'y') {
      // Variant bits: set bits 6-7 to 10 (binary), resulting in 8, 9, a, or b
      const r = Math.floor(Math.random() * 16);
      return ((r & 0x3) | 0x8).toString(16);
    }
    return ch; // Return dashes and the fixed '4' as-is
  }).join('');
}