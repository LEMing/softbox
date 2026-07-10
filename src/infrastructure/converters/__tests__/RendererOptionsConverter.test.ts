import * as THREE from 'three';
import { RendererOptionsConverter } from '../RendererOptionsConverter';

const convert = (o: Record<string, unknown>) => RendererOptionsConverter.convertRendererOptions(o);

describe('RendererOptionsConverter — post-processing', () => {
  it('omits the postProcessing block entirely when no effect is set', () => {
    expect(convert({ antialias: true }).postProcessing).toBeUndefined();
  });

  it('omits the block when every effect flag is explicitly false', () => {
    expect(convert({ bloom: false, vignette: false, filmGrain: false }).postProcessing).toBeUndefined();
  });

  it('carries a fully-specified block through when any single effect is on', () => {
    expect(convert({ vignette: true }).postProcessing).toEqual({
      bloom: false,
      vignette: true,
      filmGrain: false,
    });
  });

  it('preserves each enabled effect independently', () => {
    expect(convert({ bloom: true, filmGrain: true }).postProcessing).toEqual({
      bloom: true,
      vignette: false,
      filmGrain: true,
    });
  });

  it('resolves colorGrade: true to the balanced default amounts (and enables the block alone)', () => {
    expect(convert({ colorGrade: true }).postProcessing?.colorGrade).toEqual({
      contrast: 0.12,
      saturation: 0.15,
    });
  });

  it('fills missing colorGrade amounts from the defaults', () => {
    expect(convert({ colorGrade: { contrast: 0.3 } }).postProcessing?.colorGrade).toEqual({
      contrast: 0.3,
      saturation: 0.15,
    });
  });

  it('omits colorGrade (and the block) when it is false', () => {
    expect(convert({ colorGrade: false }).postProcessing).toBeUndefined();
  });
});

describe('RendererOptionsConverter — tone mapping', () => {
  it('maps the Neutral constant to "neutral" (renumbered enum, not a hardcoded index)', () => {
    expect(convert({ toneMapping: THREE.NeutralToneMapping }).toneMapping?.type).toBe('neutral');
  });

  it('maps the AgX constant to "agx"', () => {
    expect(convert({ toneMapping: THREE.AgXToneMapping }).toneMapping?.type).toBe('agx');
  });

  it('falls back to "neutral" for an unrecognized numeric operator', () => {
    expect(convert({ toneMapping: 999 }).toneMapping?.type).toBe('neutral');
  });

  it('passes a string operator through unchanged', () => {
    expect(convert({ toneMapping: 'reinhard' }).toneMapping?.type).toBe('reinhard');
  });
});
