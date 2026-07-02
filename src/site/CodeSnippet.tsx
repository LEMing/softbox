import React, { useEffect, useRef, useState } from 'react';
import { FONT, MONO_FONT, glassPanel } from './siteTheme';

const INSTALL = 'npm install threedviewer';
const USAGE = `import { SimpleViewer } from 'threedviewer';

<SimpleViewer object="/model.glb" options={{ ui: { presets: true } }} />`;

const Line = ({ code, onCopy, copied }: { code: string; onCopy: () => void; copied: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <pre
      style={{
        margin: 0,
        fontFamily: MONO_FONT,
        fontSize: 12,
        lineHeight: 1.55,
        color: '#26262e',
        whiteSpace: 'pre',
        overflowX: 'auto',
        flex: 1,
      }}
    >
      {code}
    </pre>
    <button
      onClick={onCopy}
      aria-label="Copy to clipboard"
      style={{
        border: 'none',
        borderRadius: 8,
        padding: '4px 10px',
        fontFamily: FONT,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        background: copied ? '#111318' : 'rgba(0,0,0,0.05)',
        color: copied ? '#fff' : '#3f3f4a',
        transition: 'background 120ms ease, color 120ms ease',
        flexShrink: 0,
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  </div>
);

/** Install + one-liner usage, each with a copy button. */
export function CodeSnippet() {
  const [copied, setCopied] = useState<'install' | 'usage' | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    },
    []
  );

  const copy = (which: 'install' | 'usage', text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = setTimeout(() => setCopied(null), 1600);
    });
  };

  return (
    <div
      style={{
        ...glassPanel,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 14px',
        maxWidth: 520,
      }}
    >
      <Line code={INSTALL} copied={copied === 'install'} onCopy={() => copy('install', INSTALL)} />
      <Line code={USAGE} copied={copied === 'usage'} onCopy={() => copy('usage', USAGE)} />
    </div>
  );
}
