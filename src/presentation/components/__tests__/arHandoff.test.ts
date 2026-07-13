/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.example.com/product?id=1"}
 */
import {
  AR_FAILURE_HASH,
  detectArMode,
  launchQuickLook,
  launchSceneViewer,
  sceneViewerIntentUrl,
  sceneViewerModelUrl,
} from '../arHandoff';

const mockRelListSupports = (supported: boolean) => {
  const relList = { supports: jest.fn(() => supported) };
  return jest
    .spyOn(document, 'createElement')
    .mockImplementation(
      () => ({ relList }) as unknown as HTMLAnchorElement
    );
};

const mockUserAgent = (value: string) =>
  jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue(value);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('detectArMode', () => {
  it('reports quick-look where the anchor relList supports "ar" (iOS Safari)', () => {
    mockRelListSupports(true);
    expect(detectArMode()).toBe('quick-look');
  });

  it('reports scene-viewer on Android without Quick Look', () => {
    mockRelListSupports(false);
    mockUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/125');
    expect(detectArMode()).toBe('scene-viewer');
  });

  it('reports null on a desktop browser', () => {
    mockRelListSupports(false);
    mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/125');
    expect(detectArMode()).toBeNull();
  });
});

describe('sceneViewerModelUrl', () => {
  it('resolves a relative model URL against the (https) page', () => {
    expect(sceneViewerModelUrl('/models/shoe.glb')).toBe(
      'https://shop.example.com/models/shoe.glb'
    );
  });

  it('passes an absolute https URL through', () => {
    expect(sceneViewerModelUrl('https://cdn.example.com/shoe.glb')).toBe(
      'https://cdn.example.com/shoe.glb'
    );
  });

  it.each([
    ['a plain-http URL — Scene Viewer fetches over HTTPS only', 'http://cdn.example.com/shoe.glb'],
    ['a dropped blob: file', 'blob:https://shop.example.com/1234'],
    ['a data: URL', 'data:model/gltf-binary;base64,xxxx'],
  ])('rejects %s', (_label, source) => {
    expect(sceneViewerModelUrl(source)).toBeNull();
  });

  it.each([
    ['an Object3D source', { isObject3D: true }],
    ['an empty string', ''],
    ['undefined', undefined],
  ])('rejects %s', (_label, source) => {
    expect(sceneViewerModelUrl(source)).toBeNull();
  });
});

describe('sceneViewerIntentUrl', () => {
  it('builds the Scene Viewer intent with the file, AR mode and a hash-marked fallback', () => {
    const url = sceneViewerIntentUrl('https://cdn.example.com/shoe.glb');

    expect(url).toContain('intent://arvr.google.com/scene-viewer/1.0?');
    expect(url).toContain(`file=${encodeURIComponent('https://cdn.example.com/shoe.glb')}`);
    expect(url).toContain('mode=ar_preferred');
    expect(url).toContain('package=com.google.ar.core');
    // The fallback is the page itself plus the failure hash: a same-document
    // navigation (no reload) that doubles as the "this device has no AR"
    // beacon the button listens for.
    expect(url).toContain(
      `S.browser_fallback_url=${encodeURIComponent(
        `https://shop.example.com/product?id=1${AR_FAILURE_HASH}`
      )}`
    );
    expect(url.endsWith(';end;')).toBe(true);
  });

  it('percent-encodes the title — URLSearchParams "+" would stay literal in the intent', () => {
    expect(sceneViewerIntentUrl('https://x.test/m.glb', 'Cozy Chair')).toContain(
      'title=Cozy%20Chair'
    );
  });
});

describe('launchQuickLook', () => {
  it('clicks a rel="ar" anchor with the mandatory <img> child', () => {
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        // Quick Look's contract: rel=ar + <img> child, or Safari downloads
        // the USDZ instead of opening AR.
        expect(this.rel).toBe('ar');
        expect(this.querySelector('img')).not.toBeNull();
        expect(this.href).toBe('https://cdn.example.com/shoe.usdz');
      });

    launchQuickLook('https://cdn.example.com/shoe.usdz');

    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('launchSceneViewer', () => {
  it('clicks a plain anchor carrying the intent URL', () => {
    let href = '';
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        href = this.getAttribute('href') ?? '';
      });

    launchSceneViewer('intent://arvr.google.com/scene-viewer/1.0?file=x#Intent;end;');

    expect(href).toBe('intent://arvr.google.com/scene-viewer/1.0?file=x#Intent;end;');
  });
});
