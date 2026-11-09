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
  it('passes a known THREE operator through unchanged', () => {
    expect(convert({ toneMapping: THREE.NeutralToneMapping }).toneMapping?.type).toBe(THREE.NeutralToneMapping);
    expect(convert({ toneMapping: THREE.AgXToneMapping }).toneMapping?.type).toBe(THREE.AgXToneMapping);
  });

  it('falls back to Neutral for an unrecognized numeric operator', () => {
    expect(convert({ toneMapping: 999 }).toneMapping?.type).toBe(THREE.NeutralToneMapping);
  });

  it('maps every legacy operator name to its THREE constant', () => {
    const expected: Array<[string, THREE.ToneMapping]> = [
      ['none', THREE.NoToneMapping],
      ['linear', THREE.LinearToneMapping],
      ['reinhard', THREE.ReinhardToneMapping],
      ['cineon', THREE.CineonToneMapping],
      ['aces', THREE.ACESFilmicToneMapping],
      ['agx', THREE.AgXToneMapping],
      ['neutral', THREE.NeutralToneMapping],
    ];
    for (const [name, constant] of expected) {
      expect(convert({ toneMapping: name }).toneMapping?.type).toBe(constant);
    }
  });

  it('falls back to Neutral for an unrecognized operator name', () => {
    expect(convert({ toneMapping: 'toString' }).toneMapping?.type).toBe(THREE.NeutralToneMapping);
  });

  it('defaults to Neutral at the requested exposure when only the exposure is set', () => {
    expect(convert({ toneMappingExposure: 1.3 }).toneMapping).toEqual({
      type: THREE.NeutralToneMapping,
      exposure: 1.3,
    });
  });

  it('omits the tone-mapping block when neither operator nor exposure is set', () => {
    expect(convert({}).toneMapping).toBeUndefined();
  });
});

describe('RendererOptionsConverter — shadow map', () => {
  it('maps PCFSoft onto PCF since three r186 removed the soft filter', () => {
    expect(convert({ shadowMapType: THREE.PCFSoftShadowMap }).shadowMap).toEqual({
      enabled: true,
      type: THREE.PCFShadowMap,
    });
  });

  it('passes the other supported THREE shadow-map types through', () => {
    expect(convert({ shadowMapType: THREE.BasicShadowMap }).shadowMap?.type).toBe(THREE.BasicShadowMap);
    expect(convert({ shadowMapType: THREE.PCFShadowMap }).shadowMap?.type).toBe(THREE.PCFShadowMap);
    expect(convert({ shadowMapType: THREE.VSMShadowMap }).shadowMap?.type).toBe(THREE.VSMShadowMap);
  });

  it('maps the legacy shadow-map names, pcfsoft onto PCF', () => {
    expect(convert({ shadowMapType: 'basic' }).shadowMap?.type).toBe(THREE.BasicShadowMap);
    expect(convert({ shadowMapType: 'pcf' }).shadowMap?.type).toBe(THREE.PCFShadowMap);
    expect(convert({ shadowMapType: 'pcfsoft' }).shadowMap?.type).toBe(THREE.PCFShadowMap);
    expect(convert({ shadowMapType: 'vsm' }).shadowMap?.type).toBe(THREE.VSMShadowMap);
  });

  it('leaves the type unset for an unrecognized value so the renderer keeps its default', () => {
    expect(convert({ shadowMapType: 999 }).shadowMap?.type).toBeUndefined();
    expect(convert({ shadowMapType: 'soft' }).shadowMap?.type).toBeUndefined();
    expect(convert({ shadowMapEnabled: false }).shadowMap).toEqual({ enabled: false, type: undefined });
  });
});
