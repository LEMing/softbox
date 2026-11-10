export function generateUUID(): string {
  const hex = '0123456789abcdef';
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  
  return Array.from(template, ch => {
    if (ch === 'x') {
      return hex[Math.floor(Math.random() * 16)];
    }
    if (ch === 'y') {
      const r = Math.floor(Math.random() * 16);
      return ((r & 0x3) | 0x8).toString(16);
    }
    return ch;
  }).join('');
}