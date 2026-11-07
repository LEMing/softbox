import React from 'react';

export interface ToggleItem {
  key: string;
  label: string;
  active: boolean;
  onToggle: (active: boolean) => void;
}

export interface TogglesProps {
  label: string;
  items: ToggleItem[];
}

/** A labelled row of independent on/off chips (site chrome, not library UI). */
export const Toggles = ({ label, items }: TogglesProps) => (
  <div role="group" aria-label={label} className="min-w-0">
    <span className="mb-2.5 block text-[10px] font-bold tracking-[0.095em] text-neutral-500 uppercase dark:text-neutral-400">
      {label}
    </span>
    <div className="-m-1 flex flex-wrap gap-1.5 p-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={item.active}
          onClick={() => item.onToggle(!item.active)}
          className={`flex min-h-9 shrink-0 items-center gap-2 rounded-[10px] border pr-3 pl-2 text-xs font-semibold whitespace-nowrap capitalize transition active:scale-[0.97] max-[480px]:min-h-11 max-[480px]:rounded-xl ${
            item.active
              ? 'border-neutral-900 bg-neutral-900 text-white shadow-md shadow-black/15 dark:border-white dark:bg-white dark:text-neutral-950'
              : 'border-black/10 bg-white/50 text-neutral-600 hover:border-black/20 hover:bg-white/85 hover:text-neutral-950 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white'
          }`}
        >
          <span
            className={`relative size-4 shrink-0 rounded-[5px] border transition ${
              item.active
                ? 'border-white/25 bg-white after:absolute after:top-1 after:left-1 after:h-1 after:w-2 after:-rotate-45 after:border-b-2 after:border-l-2 after:border-neutral-950 dark:border-black/20 dark:bg-neutral-950 dark:after:border-white'
                : 'border-black/20 bg-white/75 dark:border-white/20 dark:bg-white/10'
            }`}
            aria-hidden="true"
          />
          {item.label}
        </button>
      ))}
    </div>
  </div>
);
