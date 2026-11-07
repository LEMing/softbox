import { generateUUID } from '../uuid';

describe('generateUUID', () => {
  it('should generate a valid UUID v4 format', () => {
    const uuid = generateUUID();
    
    // Check UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidRegex);
  });

  it('should generate unique UUIDs', () => {
    const uuids = new Set();
    const count = 1000;
    
    for (let i = 0; i < count; i++) {
      uuids.add(generateUUID());
    }
    
    // All generated UUIDs should be unique
    expect(uuids.size).toBe(count);
  });

  it('should always have "4" in the 15th position', () => {
    for (let i = 0; i < 100; i++) {
      const uuid = generateUUID();
      expect(uuid[14]).toBe('4');
    }
  });

  it('should have valid variant bits in the 20th position', () => {
    const validVariants = ['8', '9', 'a', 'b'];
    
    for (let i = 0; i < 100; i++) {
      const uuid = generateUUID();
      expect(validVariants).toContain(uuid[19]);
    }
  });
});