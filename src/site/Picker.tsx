import React from 'react';

export interface PickerProps {
  label: string;
  items: string[];
  value: string;
  onChange: (value: string) => void;
}

/** A labelled row of single-choice chip buttons (site chrome, not library UI). */
export const Picker = ({ label, items, value, onChange }: PickerProps) => (
  <div role="group" aria-label={label} className="min-w-0">
    <span className="mb-2.5 block text-[10px] font-bold tracking-[0.095em] text-neutral-500 uppercase dark:text-neutral-400">
      {label}
    </span>
    <div className="-m-1 flex flex-wrap gap-1.5 p-1 max-[480px]:flex-nowrap max-[480px]:snap-x max-[480px]:overflow-x-auto max-[480px]:[scrollbar-width:none] max-[480px]:[&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={value === item}
          onClick={() => onChange(item)}
          className={`min-h-9 shrink-0 snap-start rounded-[10px] border px-3 text-xs font-semibold whitespace-nowrap capitalize transition active:scale-[0.97] max-[480px]:min-h-11 max-[480px]:rounded-xl max-[480px]:px-3.5 ${
            value === item
              ? 'border-neutral-900 bg-neutral-900 text-white shadow-md shadow-black/15 dark:border-white dark:bg-white dark:text-neutral-950'
              : 'border-black/10 bg-white/50 text-neutral-600 hover:border-black/20 hover:bg-white/85 hover:text-neutral-950 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white'
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  </div>
);
