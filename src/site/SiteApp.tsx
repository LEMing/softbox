import React, { useEffect, useRef, useState } from 'react';
import SimpleViewer from '../SimpleViewerWrapper';
import { Hotspot } from '../presentation/components/Hotspot';
import type { SimpleViewerHandle } from '../types/SimpleViewerHandle';
import { Picker } from './Picker';
import { Toggles } from './Toggles';
import { CodeSnippet } from './CodeSnippet';
import { useDropModel } from './useDropModel';
import { useMediaQuery } from './useMediaQuery';
import { DEFAULT_SCENE, VIEWER_SCENES } from '../scenes';
import type { ViewerScene } from '../types/options';

// The Khronos sample set mixes wildly different authored scales (some in
// real-world meters, some arbitrary). WaterBottle and Avocado are already
// real-world-scale (a bottle ~0.26m, an avocado ~0.06m) so they're used
// as-is; Lantern/Helmet/Fox are re-hosted local copies with a corrective
// root-node scale baked in (see scratch-rescale-glb.mjs in git history) so
// every sample model sits at a consistent, plausible real-world size under
// the same 1-unit-= 1-meter convention as the Motorhome.
// Local model paths are relative (no leading slash): they resolve against the
// page URL, so the same build works at '/' in dev and under '/softbox/' on
// GitHub Pages. Root-absolute paths 404 on Pages — they escape the base path.
const SAMPLE_MODELS: Record<string, string> = {
  Motorhome: 'motorhome.glb',
  Lantern: 'lantern.glb',
  Helmet: 'helmet.glb',
  WaterBottle: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/WaterBottle/glTF-Binary/WaterBottle.glb',
  Avocado: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb',
  // Carries KHR_materials_variants (colorways) — the Variant picker's showcase.
  Shoe: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb',
  // Animated (Survey/Walk/Run clips) — the `animations` toggle's showcase.
  Fox: 'fox.glb',
};

const DROPPED_KEY = 'yours';

// A hand-tuned cinematic framing for the Motorhome model specifically — an
// elevated 3/4 hero angle, rather than the generic auto-fit's plainer view.
// Values are absolute world coordinates measured against this model's own
// bounding box, so this preset is only meaningful for it.
const MOTORHOME_CAMERA = {
  // Pulled back a further ~1.35x from the target: the earlier framing filled the
  // whole frame edge-to-edge (jarringly tight next to the roomy auto-fit models,
  // and worse on wide windows), so give the hero shot breathing room.
  position: [-9.5, 8.88, 16.38] as const,
  target: [0.02, 1.37, -0.1] as const,
  fov: 30,
};

// Portrait screens need substantially more distance to fit a long vehicle
// inside their narrow horizontal field of view. The direction stays the same
// as the desktop hero angle, only the dolly distance changes.
const MOTORHOME_MOBILE_CAMERA = {
  position: [-15.21, 13.39, 26.27] as const,
  target: MOTORHOME_CAMERA.target,
  fov: 30,
};

interface Pin {
  id: number;
  point: [number, number, number];
}

const GLASS_SURFACE =
  'border border-white/70 bg-white/85 shadow-[0_18px_50px_rgba(24,25,28,0.12),0_2px_8px_rgba(24,25,28,0.05)] backdrop-blur-2xl dark:border-white/10 dark:bg-neutral-950/85 dark:shadow-black/35';

const ICON_BUTTON =
  'grid size-10 cursor-pointer place-items-center rounded-xl bg-transparent text-neutral-600 no-underline transition hover:bg-black/7 hover:text-neutral-950 active:scale-95 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white';

const GitHubMark = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

const NpmMark = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M0 0v16h16V0H0zm13 13h-2V5H8v8H3V3h10v10z" />
  </svg>
);

const UploadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SlidersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 7h10m4 0h2M4 17h2m4 0h10M14 4v6M10 14v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const CodeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m8.5 8-4 4 4 4m7-8 4 4-4 4M14 5l-4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
};

/**
 * The playground site: a full-viewport viewer as the hero, the library's own
 * preset picker as the controls, plus site chrome — brand, sample-model picker,
 * install snippet, your own .glb via drag & drop or the file browser, click-to-
 * pin hotspots (object:selected) and a captureStill download button.
 */
export function SiteApp() {
  const { dropped, isDragging, rejectedName, loadFile } = useDropModel();
  const [selected, setSelected] = useState<string>('Motorhome');
  const [scene, setScene] = useState<ViewerScene>(DEFAULT_SCENE);
  const [turntable, setTurntable] = useState(false);
  const [animations, setAnimations] = useState(false);
  const [pathTraced, setPathTraced] = useState(false);
  const [bloom, setBloom] = useState(false);
  const [vignette, setVignette] = useState(false);
  const [filmGrain, setFilmGrain] = useState(false);
  const [colorGrade, setColorGrade] = useState(false);
  const [pins, setPins] = useState<Pin[]>([]);
  const [variantNames, setVariantNames] = useState<string[]>([]);
  const [variant, setVariant] = useState<string | null>(null);
  const [stillState, setStillState] = useState<'idle' | 'capturing' | 'failed'>('idle');
  const [mobilePanel, setMobilePanel] = useState<'controls' | 'code' | null>(null);
  const pinIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<SimpleViewerHandle>(null);
  const useMobileCamera = useMediaQuery('(max-width: 700px)');

  // A fresh drop always takes the stage.
  useEffect(() => {
    if (dropped) {
      setSelected(DROPPED_KEY);
    }
  }, [dropped]);

  // Click the model to pin a hotspot at the hit point (the object:selected demo).
  useEffect(() => {
    const handle = viewerRef.current;
    if (!handle) {
      return;
    }
    return handle.events.on('object:selected', ({ point }) => {
      pinIdRef.current += 1;
      const id = pinIdRef.current;
      setPins((current) => [...current, { id, point: [point.x, point.y, point.z] }]);
    });
  }, []);

  // Offer the Variant picker only for models that carry material variants.
  useEffect(() => {
    const handle = viewerRef.current;
    if (!handle) {
      return;
    }
    return handle.events.on('model:loaded', () => {
      // Read the ref at call time: the handle is recreated as the viewer
      // initializes/rebuilds, and only the latest one sees the loaded model.
      setVariantNames(viewerRef.current?.getVariantNames() ?? []);
    });
  }, []);

  const pickerItems = dropped ? [...Object.keys(SAMPLE_MODELS), DROPPED_KEY] : Object.keys(SAMPLE_MODELS);
  const modelUrl = selected === DROPPED_KEY && dropped ? dropped.url : SAMPLE_MODELS[selected];

  // Pins are anchored to the current model's surface — clear them with it.
  // Variants belong to the model too: reset both until the next load reports.
  useEffect(() => {
    setPins([]);
    setVariant(null);
    setVariantNames([]);
  }, [modelUrl]);

  const handleFileChosen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      loadFile(file);
    }
    // Allow re-choosing the same file.
    event.target.value = '';
  };

  const handleDownloadStill = async () => {
    const handle = viewerRef.current;
    if (!handle || stillState === 'capturing') {
      return;
    }
    setStillState('capturing');
    try {
      const dataUrl = await handle.captureStill({ width: 1920 });
      downloadDataUrl(dataUrl, 'softbox-still.png');
      setStillState('idle');
    } catch {
      setStillState('failed');
      setTimeout(() => setStillState('idle'), 2000);
    }
  };

  const removePin = (id: number) => {
    setPins((current) => current.filter((pin) => pin.id !== id));
  };

  const lookChangeCount = [
    scene !== DEFAULT_SCENE,
    turntable,
    animations,
    pathTraced,
    bloom,
    vignette,
    filmGrain,
    colorGrade,
    variant !== null,
  ].filter(Boolean).length;

  const resetLook = () => {
    setScene(DEFAULT_SCENE);
    setTurntable(false);
    setAnimations(false);
    setPathTraced(false);
    setBloom(false);
    setVignette(false);
    setFilmGrain(false);
    setColorGrade(false);
    setVariant(null);
  };

  const optionLines = [
    '    ui: { presets: true },',
    ...(scene !== DEFAULT_SCENE ? [`    scene: '${scene}',`] : []),
    ...(variant ? [`    variant: '${variant}',`] : []),
    ...(pathTraced ? ['    pathTracing: { enabled: true },'] : []),
    ...(bloom || vignette || filmGrain || colorGrade
      ? [`    renderer: { ${[
          ...(bloom ? ['bloom: true'] : []),
          ...(vignette ? ['vignette: true'] : []),
          ...(filmGrain ? ['filmGrain: true'] : []),
          ...(colorGrade ? ['colorGrade: true'] : []),
        ].join(', ')} },`]
      : []),
  ];
  const usage = [
    "import { SimpleViewer } from 'softbox';",
    '',
    '<SimpleViewer',
    '  object="/model.glb"',
    ...(turntable ? ['  turntable'] : []),
    ...(animations ? ['  animations'] : []),
    '  options={{',
    ...optionLines,
    '  }}',
    '/>',
  ].join('\n');

  const selectedModelName = selected === DROPPED_KEY && dropped ? dropped.name : selected;
  const controlsOpen = mobilePanel === 'controls';
  const codeOpen = mobilePanel === 'code';

  return (
    <main className="relative isolate h-full w-full overflow-hidden bg-neutral-100 font-sans text-neutral-950 scheme-light dark:bg-neutral-950 dark:text-white dark:scheme-dark">
      <SimpleViewer
        ref={viewerRef}
        object={modelUrl}
        turntable={turntable}
        animations={animations}
        options={{
          ui: { presets: true },
          scene,
          variant,
          // Phones get the native-AR chip; desktop (and dropped blob: files)
          // hide it on their own.
          ar: true,
          // The Motorhome gets a declarative hero-shot camera so the framing
          // survives any structural rebuild. autoFitToObject is off so the
          // hand-tuned 30° framing sticks instead of being re-fit.
          ...(selected === 'Motorhome'
            ? {
                camera: {
                  position: [...(useMobileCamera ? MOTORHOME_MOBILE_CAMERA.position : MOTORHOME_CAMERA.position)],
                  target: [...(useMobileCamera ? MOTORHOME_MOBILE_CAMERA.target : MOTORHOME_CAMERA.target)],
                  fov: useMobileCamera ? MOTORHOME_MOBILE_CAMERA.fov : MOTORHOME_CAMERA.fov,
                  autoFitToObject: false,
                },
              }
            : {}),
          ...(pathTraced ? { pathTracing: { enabled: true } } : {}),
          // Post-processing effects are RUNTIME fields: toggling one swaps the
          // composer on the live viewer — no rebuild, no model reload, and the
          // picked preset survives (the old remount-on-key hack is gone).
          renderer: { bloom, vignette, filmGrain, colorGrade },
        }}
      >
        {pins.map((pin, index) => (
          <Hotspot key={pin.id} position={pin.point} occlude>
            <button
              type="button"
              onClick={() => removePin(pin.id)}
              aria-label={`Remove hotspot ${index + 1}`}
              title="Click to remove"
              className="grid size-6 cursor-pointer place-items-center rounded-full border-2 border-white/95 bg-neutral-950/90 p-0 text-[11px] leading-none font-bold text-white shadow-lg shadow-black/35 transition hover:scale-110 dark:border-neutral-950/90 dark:bg-white dark:text-neutral-950"
            >
              {index + 1}
            </button>
          </Hotspot>
        ))}
      </SimpleViewer>

      <header className="pointer-events-none absolute top-[max(14px,env(safe-area-inset-top))] right-4 left-4 z-20 flex items-center justify-between max-[1100px]:top-[max(10px,env(safe-area-inset-top))] max-[1100px]:right-2.5 max-[1100px]:left-2.5">
        <div className={`${GLASS_SURFACE} pointer-events-auto flex h-[52px] items-center gap-2.5 rounded-2xl py-1.5 pr-3 pl-2 max-[1100px]:h-12 max-[1100px]:rounded-[15px] max-[1100px]:pr-2.5 max-[1100px]:pl-1.5`}>
          <div className="grid size-9 place-items-center rounded-[11px] bg-neutral-950 text-xl font-extrabold tracking-[-0.06em] text-white shadow-lg shadow-black/20 dark:bg-white dark:text-neutral-950" aria-hidden="true">s</div>
          <div className="flex min-w-0 flex-col gap-px leading-tight">
            <strong className="text-[15px] font-bold tracking-[-0.025em]">softbox</strong>
            <span className="text-[11px] whitespace-nowrap text-neutral-500 dark:text-neutral-400 max-[480px]:hidden">React 3D viewer</span>
          </div>
          <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-700/15 bg-emerald-50/80 px-2 py-1 text-[10px] font-bold tracking-[0.04em] text-emerald-700 uppercase dark:border-emerald-300/15 dark:bg-emerald-400/10 dark:text-emerald-300 max-[1100px]:hidden">
            <i className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" aria-hidden="true" /> Live
          </span>
        </div>

        <nav className={`${GLASS_SURFACE} pointer-events-auto flex h-[52px] items-center gap-1 rounded-2xl p-1 max-[1100px]:h-12 max-[1100px]:rounded-[15px]`} aria-label="Project links and actions">
          <button
            type="button"
            className="flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-neutral-950 px-3.5 text-xs font-bold text-white shadow-lg shadow-black/15 transition hover:bg-neutral-800 active:scale-[0.97] dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 max-[1100px]:w-10 max-[1100px]:justify-center max-[1100px]:px-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon />
            <span className="max-[1100px]:hidden">Open .glb</span>
          </button>
          <span className="mx-1 h-5.5 w-px bg-black/10 dark:bg-white/10 max-[1100px]:hidden" aria-hidden="true" />
          <a href="https://github.com/LEMing/softbox" target="_blank" rel="noreferrer" aria-label="GitHub repository" className={`${ICON_BUTTON} max-[480px]:hidden`}>
            <GitHubMark />
          </a>
          <a href="https://www.npmjs.com/package/softbox" target="_blank" rel="noreferrer" aria-label="npm package" className={`${ICON_BUTTON} max-[480px]:hidden`}>
            <NpmMark />
          </a>
        </nav>
      </header>

      <button
        type="button"
        className={`absolute inset-0 z-30 hidden cursor-default border-0 bg-neutral-950/30 backdrop-blur-[3px] transition duration-200 max-[1100px]:block ${
          mobilePanel !== null
            ? 'max-[1100px]:visible max-[1100px]:opacity-100'
            : 'max-[1100px]:invisible max-[1100px]:opacity-0'
        }`}
        onClick={() => setMobilePanel(null)}
        aria-label="Close open panel"
        tabIndex={mobilePanel === null ? -1 : 0}
      />

      <aside
        id="playground-controls"
        className={`${GLASS_SURFACE} absolute top-20 left-4 z-[15] flex max-h-[calc(100dvh-158px)] w-[366px] flex-col overflow-hidden rounded-[22px] transition-[transform,opacity,visibility] duration-300 ease-out max-[1100px]:top-auto max-[1100px]:right-0 max-[1100px]:bottom-0 max-[1100px]:left-0 max-[1100px]:z-40 max-[1100px]:max-h-[min(76dvh,720px)] max-[1100px]:w-auto max-[1100px]:rounded-t-[26px] max-[1100px]:rounded-b-none max-[1100px]:border-white/60 max-[1100px]:bg-white/97 max-[1100px]:pb-[env(safe-area-inset-bottom)] max-[1100px]:shadow-[0_-16px_50px_rgba(24,25,28,0.16)] dark:max-[1100px]:border-white/10 dark:max-[1100px]:bg-neutral-950/97 ${
          controlsOpen
            ? 'max-[1100px]:visible max-[1100px]:translate-y-0 max-[1100px]:opacity-100'
            : 'max-[1100px]:invisible max-[1100px]:translate-y-[calc(100%+16px)] max-[1100px]:opacity-0'
        }`}
      >
        <div className="absolute top-2 left-1/2 z-10 hidden h-1 w-8 -translate-x-1/2 rounded-full bg-black/20 dark:bg-white/20 max-[1100px]:block" aria-hidden="true" />
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-4 max-[1100px]:pt-6 max-[480px]:px-4">
          <div>
            <span className="block text-[10px] font-bold tracking-[0.095em] text-neutral-500 uppercase dark:text-neutral-400">Live playground</span>
            <h1 className="mt-1 text-xl leading-none font-bold tracking-[-0.04em] text-neutral-950 dark:text-white">Customize the shot</h1>
            <p className="mt-1.5 max-w-52 overflow-hidden text-xs text-ellipsis whitespace-nowrap text-neutral-500 dark:text-neutral-400" title={selectedModelName}>{selectedModelName}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={resetLook}
              className="min-h-8 cursor-pointer rounded-lg bg-black/5 px-2.5 text-[11px] font-bold text-neutral-600 transition hover:bg-black/10 disabled:cursor-default disabled:opacity-35 dark:bg-white/8 dark:text-neutral-300 dark:hover:bg-white/15"
              disabled={lookChangeCount === 0}
            >
              Reset
            </button>
            <button type="button" onClick={() => setMobilePanel(null)} className={`${ICON_BUTTON} hidden text-2xl font-light max-[1100px]:grid`} aria-label="Close controls">
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-color:rgba(20,21,24,0.14)_transparent] [scrollbar-width:thin]">
          <section className="border-t border-black/8 px-5 py-4.5 dark:border-white/10 max-[480px]:px-4">
            <Picker label="Model" items={pickerItems} value={selected} onChange={setSelected} />
          </section>

          <section className="flex flex-col gap-4 border-t border-black/8 px-5 py-4.5 dark:border-white/10 max-[480px]:px-4">
            <Picker
              label="Scene"
              items={Object.keys(VIEWER_SCENES)}
              value={scene}
              onChange={(value) => setScene(value as ViewerScene)}
            />
            {variantNames.length > 0 && (
              <Picker
                label="Variant"
                items={['default', ...variantNames]}
                value={variant ?? 'default'}
                onChange={(name) => setVariant(name === 'default' ? null : name)}
              />
            )}
          </section>

          <section className="flex flex-col gap-5 border-t border-black/8 px-5 py-4.5 dark:border-white/10 max-[480px]:px-4">
            <Toggles
              label="Motion"
              items={[
                { key: 'turntable', label: 'turntable', active: turntable, onToggle: setTurntable },
                { key: 'animations', label: 'animations', active: animations, onToggle: setAnimations },
              ]}
            />
            <Toggles
              label="Quality"
              items={[
                { key: 'pathtraced', label: 'path traced', active: pathTraced, onToggle: setPathTraced },
              ]}
            />
            <Toggles
              label="Finishing"
              items={[
                { key: 'bloom', label: 'bloom', active: bloom, onToggle: setBloom },
                { key: 'vignette', label: 'vignette', active: vignette, onToggle: setVignette },
                { key: 'grain', label: 'grain', active: filmGrain, onToggle: setFilmGrain },
                { key: 'grade', label: 'grade', active: colorGrade, onToggle: setColorGrade },
              ]}
            />
          </section>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-black/8 px-5 pt-3 pb-4 text-[10.5px] leading-tight text-neutral-500 dark:border-white/10 dark:text-neutral-400 max-[1100px]:flex-wrap max-[480px]:px-4" role="status">
          {rejectedName ? (
            <span className="font-semibold text-red-700 dark:text-red-400">Only self-contained <code>.glb</code> models are supported</span>
          ) : (
            <>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex cursor-pointer items-center gap-1.5 bg-transparent p-0 text-[11px] font-bold whitespace-nowrap text-neutral-800 hover:underline hover:underline-offset-3 dark:text-neutral-200">
                <UploadIcon /> Import your model
              </button>
              <span>or drop a .glb anywhere</span>
              <span className="hidden w-full pt-0.5 max-[1100px]:block">Tip: click the model to add a hotspot</span>
            </>
          )}
        </div>
      </aside>

      <aside
        id="playground-code"
        className={`absolute top-20 right-4 z-[15] w-[min(410px,calc(100vw-430px))] transition-[transform,opacity,visibility] duration-300 ease-out max-[1100px]:top-auto max-[1100px]:right-0 max-[1100px]:bottom-0 max-[1100px]:left-0 max-[1100px]:z-40 max-[1100px]:max-h-[min(76dvh,720px)] max-[1100px]:w-auto max-[1100px]:overflow-hidden max-[1100px]:rounded-t-[26px] max-[1100px]:bg-white/97 max-[1100px]:pb-[env(safe-area-inset-bottom)] max-[1100px]:shadow-[0_-16px_50px_rgba(24,25,28,0.16)] dark:max-[1100px]:bg-neutral-950/97 ${
          codeOpen
            ? 'max-[1100px]:visible max-[1100px]:translate-y-0 max-[1100px]:opacity-100'
            : 'max-[1100px]:invisible max-[1100px]:translate-y-[calc(100%+16px)] max-[1100px]:opacity-0'
        }`}
      >
        <div className="absolute top-2 left-1/2 z-10 hidden h-1 w-8 -translate-x-1/2 rounded-full bg-black/20 dark:bg-white/20 max-[1100px]:block" aria-hidden="true" />
        <CodeSnippet usage={usage} onClose={() => setMobilePanel(null)} />
      </aside>

      <div className={`${GLASS_SURFACE} absolute bottom-[calc(68px+env(safe-area-inset-bottom))] left-1/2 z-20 hidden min-h-11 -translate-x-1/2 items-stretch rounded-[15px] p-1 max-[1100px]:flex`} aria-label="Playground panels">
        <button
          type="button"
          className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-[11px] font-bold whitespace-nowrap transition active:scale-[0.97] ${
            controlsOpen
              ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
              : 'bg-transparent text-neutral-700 hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/10'
          }`}
          aria-expanded={controlsOpen}
          aria-controls="playground-controls"
          onClick={() => setMobilePanel(controlsOpen ? null : 'controls')}
        >
          <SlidersIcon />
          <span>Customize</span>
          {lookChangeCount > 0 && (
            <strong
              aria-label={`${lookChangeCount} active changes`}
              className={`grid size-[17px] place-items-center rounded-full text-[9px] ${
                controlsOpen
                  ? 'bg-white text-neutral-950 dark:bg-neutral-950 dark:text-white'
                  : 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
              }`}
            >
              {lookChangeCount}
            </strong>
          )}
        </button>
        <span className="my-2 w-px bg-black/10 dark:bg-white/10" aria-hidden="true" />
        <button
          type="button"
          className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-[11px] font-bold whitespace-nowrap transition active:scale-[0.97] ${
            codeOpen
              ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
              : 'bg-transparent text-neutral-700 hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/10'
          }`}
          aria-expanded={codeOpen}
          aria-controls="playground-code"
          onClick={() => setMobilePanel(codeOpen ? null : 'code')}
        >
          <CodeIcon />
          <span>Code</span>
        </button>
      </div>

      <button
        type="button"
        onClick={handleDownloadStill}
        disabled={stillState === 'capturing'}
        className={`${GLASS_SURFACE} absolute right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-[15] flex min-h-[42px] cursor-pointer items-center gap-2 rounded-[14px] px-4 text-[11.5px] font-bold transition active:scale-[0.97] disabled:cursor-wait disabled:opacity-70 max-[1100px]:top-[calc(max(10px,env(safe-area-inset-top))+58px)] max-[1100px]:right-2.5 max-[1100px]:bottom-auto max-[1100px]:size-[42px] max-[1100px]:min-h-0 max-[1100px]:justify-center max-[1100px]:p-0 ${
          stillState === 'failed' ? 'text-red-700 dark:text-red-400' : 'text-neutral-950 dark:text-white'
        }`}
        data-state={stillState}
        aria-label="Download still"
      >
        <DownloadIcon />
        <span className="max-[1100px]:hidden">{stillState === 'capturing' ? 'Capturing…' : stillState === 'failed' ? 'Capture failed' : 'Save still'}</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".glb"
        onChange={handleFileChosen}
        aria-label="Choose a .glb model file"
        className="sr-only"
        tabIndex={-1}
      />

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-[60] grid place-items-center bg-neutral-950/30 backdrop-blur-[10px]">
          <div className={`${GLASS_SURFACE} flex min-w-[270px] flex-col items-center gap-1 rounded-3xl px-8 py-6 text-center`}>
            <span className="mb-2 grid size-11 place-items-center rounded-[14px] bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"><UploadIcon /></span>
            <strong className="text-[17px] tracking-[-0.025em]">Drop to preview</strong>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Your model stays on this device</span>
          </div>
        </div>
      )}
    </main>
  );
}
