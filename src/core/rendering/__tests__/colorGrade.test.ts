import { resolveColorGrade } from '../colorGrade';

describe('resolveColorGrade', () => {
  it('resolves true to the balanced default amounts', () => {
    expect(resolveColorGrade(true)).toEqual({ contrast: 0.12, saturation: 0.15 });
  });

  it('returns a fresh object for each true so callers cannot mutate the defaults', () => {
    const first = resolveColorGrade(true);
    first!.contrast = 1;
    expect(resolveColorGrade(true)).toEqual({ contrast: 0.12, saturation: 0.15 });
  });

  it('fills missing amounts from the defaults', () => {
    expect(resolveColorGrade({ saturation: 0.4 })).toEqual({ contrast: 0.12, saturation: 0.4 });
    expect(resolveColorGrade({ contrast: 0.3 })).toEqual({ contrast: 0.3, saturation: 0.15 });
  });

  it('turns grading off for falsy and unsupported values', () => {
    expect(resolveColorGrade(false)).toBeUndefined();
    expect(resolveColorGrade(undefined)).toBeUndefined();
    expect(resolveColorGrade('strong')).toBeUndefined();
  });
});
