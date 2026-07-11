import { pickRuntimeOptions } from '../runtimeOptions';
import { SimpleViewerOptions } from '../SimpleViewerOptions';

describe('pickRuntimeOptions', () => {
  it('picks only the runtime-tunable fields, omitting structural ones', () => {
    const options: SimpleViewerOptions = {
      backgroundColor: '#fff',
      staticScene: true,
      camera: { autoFitToObject: true },
      renderer: { antialias: false, toneMappingExposure: 1.2 },
      environment: { url: 'env.hdr', environmentIntensity: 0.5 },
      controls: { enablePan: false, autoRotate: true, autoRotateSpeed: 3 },
      animations: { autoplay: true, speed: 2 },
      pathTracing: { enabled: true, maxSamples: 500, bounces: 8 },
    };

    expect(pickRuntimeOptions(options)).toEqual({
      backgroundColor: '#fff',
      // The effect toggles are always emitted resolved (`?? false`) so removing
      // one from the options turns it off live; antialias stays structural.
      renderer: {
        toneMappingExposure: 1.2,
        bloom: false,
        vignette: false,
        filmGrain: false,
        colorGrade: false,
      },
      environment: { environmentIntensity: 0.5 },
      controls: { autoRotate: true, autoRotateSpeed: 3 },
      animations: { autoplay: true, speed: 2 },
      // Only `enabled` is runtime; maxSamples/bounces configure the tracer at
      // construction and stay structural.
      pathTracing: { enabled: true },
    });
  });

  it('omits pathTracing when only its structural fields are set', () => {
    const options: SimpleViewerOptions = { pathTracing: { maxSamples: 300 } };
    expect(pickRuntimeOptions(options).pathTracing).toBeUndefined();
  });

  it('picks pathTracing.enabled: false so a disable reaches updateOptions', () => {
    const options: SimpleViewerOptions = { pathTracing: { enabled: false } };
    expect(pickRuntimeOptions(options).pathTracing).toEqual({ enabled: false });
  });

  it('omits a sub-object entirely when none of its runtime fields are set', () => {
    const options: SimpleViewerOptions = {
      renderer: { antialias: true },
      environment: { url: 'env.hdr' },
      controls: { enablePan: false },
      animations: {},
    };

    const result = pickRuntimeOptions(options);
    // renderer is the exception: the effect toggles are always emitted
    // resolved-to-false so a removed effect is switched off live.
    expect(result.renderer).toEqual({
      bloom: false,
      vignette: false,
      filmGrain: false,
      colorGrade: false,
    });
    expect(result.environment).toBeUndefined();
    expect(result.controls).toBeUndefined();
    expect(result.animations).toBeUndefined();
  });

  it('picks a single set field without requiring its siblings', () => {
    const options: SimpleViewerOptions = { controls: { autoRotate: false } };
    expect(pickRuntimeOptions(options).controls).toEqual({
      autoRotate: false,
      autoRotateSpeed: undefined,
    });
  });

  it('returns just backgroundColor and the resolved effect toggles when nothing else is set', () => {
    const options: SimpleViewerOptions = {};
    expect(pickRuntimeOptions(options)).toEqual({
      backgroundColor: undefined,
      renderer: { bloom: false, vignette: false, filmGrain: false, colorGrade: false },
    });
  });

  it('picks the effect toggles through so switching one applies live', () => {
    const options: SimpleViewerOptions = {
      renderer: { bloom: true, colorGrade: { contrast: 0.2 } },
    };
    expect(pickRuntimeOptions(options).renderer).toEqual({
      bloom: true,
      vignette: false,
      filmGrain: false,
      colorGrade: { contrast: 0.2 },
    });
  });

  it('picks the radial-vignette edge colour so a live preset switch repaints it', () => {
    const options: SimpleViewerOptions = {
      backgroundColor: '#242430',
      backgroundColorEdge: '#050507',
    };
    const result = pickRuntimeOptions(options);
    expect(result.backgroundColor).toBe('#242430');
    expect(result.backgroundColorEdge).toBe('#050507');
  });
});
