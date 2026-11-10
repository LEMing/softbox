export type ArMode = 'quick-look' | 'scene-viewer';

export const AR_FAILURE_HASH = '#softbox-ar-failed';

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

export function sceneViewerModelUrl(source: unknown): string | null {
  if (typeof window === 'undefined' || typeof source !== 'string' || source.length === 0) {
    return null;
  }
  try {
    const url = new URL(source, window.location.href);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function sceneViewerIntentUrl(fileUrl: string, title?: string): string {
  let query = `file=${encodeURIComponent(fileUrl)}&mode=ar_preferred`;
  if (title) {
    query += `&title=${encodeURIComponent(title)}`;
  }
  const fallbackUrl = new URL(window.location.href);
  fallbackUrl.hash = AR_FAILURE_HASH;
  return (
    `intent://arvr.google.com/scene-viewer/1.0?${query}` +
    '#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;' +
    `S.browser_fallback_url=${encodeURIComponent(fallbackUrl.toString())};end;`
  );
}

export function launchQuickLook(usdzUrl: string): void {
  const anchor = document.createElement('a');
  anchor.rel = 'ar';
  anchor.appendChild(document.createElement('img'));
  anchor.href = usdzUrl;
  anchor.click();
}

export function launchSceneViewer(intentUrl: string): void {
  const anchor = document.createElement('a');
  anchor.href = intentUrl;
  anchor.click();
}
