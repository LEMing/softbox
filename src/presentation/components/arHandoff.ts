/**
 * Native AR handoff plumbing: capability detection and launchers for
 * iOS AR Quick Look and Android Scene Viewer. Pure DOM — no three.js.
 */

export type ArMode = 'quick-look' | 'scene-viewer';

/**
 * Which native AR viewer this browser can hand off to, or `null` (desktop,
 * SSR). iOS Safari and WKWebViews advertise Quick Look through anchor
 * relList support for `ar`; Android browsers reach Scene Viewer through an
 * `intent://` URL.
 */
export function detectArMode(): ArMode | null {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') {
    return null;
  }
  const anchor = document.createElement('a');
  if (anchor.relList?.supports?.('ar')) {
    return 'quick-look';
  }
  if (/android/i.test(navigator.userAgent)) {
    return 'scene-viewer';
  }
  return null;
}

/**
 * The loaded model's address as Scene Viewer will fetch it, or `null` when
 * there is nothing a native app could reach: a consumer-provided Object3D
 * has no URL at all, and `blob:`/`data:` sources (dropped files) only exist
 * inside this page. Relative URLs resolve against the page.
 */
export function sceneViewerModelUrl(source: unknown): string | null {
  if (typeof source !== 'string' || source.length === 0) {
    return null;
  }
  try {
    const url = new URL(source, window.location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The `intent://` URL that opens `fileUrl` in Android Scene Viewer in AR. */
export function sceneViewerIntentUrl(fileUrl: string, title?: string): string {
  const params = new URLSearchParams({ file: fileUrl, mode: 'ar_preferred' });
  if (title) {
    params.set('title', title);
  }
  const fallback = encodeURIComponent(window.location.href);
  return (
    `intent://arvr.google.com/scene-viewer/1.0?${params.toString()}` +
    '#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;' +
    `S.browser_fallback_url=${fallback};end;`
  );
}

/**
 * Open a USDZ in AR Quick Look. Quick Look triggers only for an anchor with
 * `rel="ar"` AND an `<img>` direct child — a bare anchor would navigate to
 * the USDZ as a download instead. The anchor never enters the document; a
 * synthetic click is enough.
 */
export function launchQuickLook(usdzUrl: string): void {
  const anchor = document.createElement('a');
  anchor.rel = 'ar';
  anchor.appendChild(document.createElement('img'));
  anchor.href = usdzUrl;
  anchor.click();
}

/** Open an `intent://` URL (Scene Viewer) via a synthetic anchor click. */
export function launchSceneViewer(intentUrl: string): void {
  const anchor = document.createElement('a');
  anchor.href = intentUrl;
  anchor.click();
}
