import React, { useEffect, useRef, useState } from 'react';

const INSTALL = 'npm install softbox';
const DEFAULT_USAGE = `import { SimpleViewer } from 'softbox';

<SimpleViewer
  object="/model.glb"
  options={{ ui: { presets: true } }}
/>`;

const Line = ({
  code,
  label,
  eyebrow,
  onCopy,
  copied,
}: {
  code: string;
  label: string;
  eyebrow: string;
  onCopy: () => void;
  copied: boolean;
}) => (
  <div className="min-w-0 overflow-hidden rounded-[13px] border border-black/8 bg-neutral-100/85 dark:border-white/10 dark:bg-white/5">
    <div className="flex h-9 items-center justify-between border-b border-black/7 pr-2 pl-3 dark:border-white/8">
      <span className="text-[10px] font-bold tracking-[0.095em] text-neutral-500 uppercase dark:text-neutral-400">
        {eyebrow}
      </span>
      <button
        onClick={onCopy}
        aria-label={label}
        className={`h-7 min-w-12 cursor-pointer rounded-lg px-2 text-[10px] font-bold transition active:scale-95 ${
          copied
            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950'
            : 'bg-black/6 text-neutral-600 hover:bg-black/10 dark:bg-white/8 dark:text-neutral-300 dark:hover:bg-white/15'
        }`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
    <pre className="m-0 max-h-56 overflow-auto p-3 font-mono text-[10.5px] leading-[1.55] whitespace-pre text-neutral-700 [scrollbar-width:thin] dark:text-neutral-300 max-[480px]:max-h-52 max-[480px]:text-[10px]">
      {code}
    </pre>
  </div>
);

/**
 * Install + usage snippets, each with a copy button. The usage code is a prop
 * so the site can keep it in sync with the live toggles — the snippet IS the
 * documentation for what the user is currently seeing.
 */
export function CodeSnippet({
  usage = DEFAULT_USAGE,
  onClose,
}: {
  usage?: string;
  onClose?: () => void;
}) {
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
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(which);
        if (resetTimerRef.current) {
          clearTimeout(resetTimerRef.current);
        }
        resetTimerRef.current = setTimeout(() => setCopied(null), 1600);
      })
      .catch(() => {
        // Clipboard permission denied — the button simply stays "Copy".
      });
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-[22px] border border-white/70 bg-white/85 p-4 shadow-[0_18px_50px_rgba(24,25,28,0.12),0_2px_8px_rgba(24,25,28,0.05)] backdrop-blur-2xl dark:border-white/10 dark:bg-neutral-950/85 dark:shadow-black/35 max-[1100px]:max-h-[min(76dvh,720px)] max-[1100px]:overflow-y-auto max-[1100px]:rounded-t-[26px] max-[1100px]:rounded-b-none max-[1100px]:border-0 max-[1100px]:bg-transparent max-[1100px]:pt-6 max-[1100px]:shadow-none max-[1100px]:backdrop-blur-none max-[480px]:px-3.5">
      <div className="flex items-start justify-between px-0.5 pb-1">
        <div>
          <span className="block text-[10px] font-bold tracking-[0.095em] text-neutral-500 uppercase dark:text-neutral-400">
            React
          </span>
          <h2 className="mt-1 text-[17px] leading-none font-bold tracking-[-0.035em] text-neutral-950 dark:text-white">
            Ship this look
          </h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="hidden size-10 cursor-pointer place-items-center rounded-xl text-2xl font-light text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10 max-[1100px]:grid"
            aria-label="Close code"
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
      <Line
        code={INSTALL}
        eyebrow="Install"
        label="Copy install command"
        copied={copied === 'install'}
        onCopy={() => copy('install', INSTALL)}
      />
      <Line
        code={usage}
        eyebrow="Component"
        label="Copy usage code"
        copied={copied === 'usage'}
        onCopy={() => copy('usage', usage)}
      />
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </div>
  );
}
