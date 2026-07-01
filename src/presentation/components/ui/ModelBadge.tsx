import React from 'react';
import { ChromeTheme, surfaceStyle } from './theme';
import { ModelIcon } from './icons';

export interface ModelBadgeProps {
  theme: ChromeTheme;
  name: string;
}

/** Top-left pill showing the current model's name. */
export function ModelBadge({ theme, name }: ModelBadgeProps) {
  return (
    <div
      data-testid="viewer-model-badge"
      style={{
        ...surfaceStyle(theme),
        position: 'absolute',
        top: 12,
        left: 12,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: 'calc(100% - 84px)',
        height: 34,
        padding: '0 12px',
        borderRadius: 17,
        fontSize: 13,
        fontWeight: 500,
        pointerEvents: 'none',
      }}
    >
      <span style={{ color: theme.textMuted, display: 'inline-flex' }}>
        <ModelIcon size={16} />
      </span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
    </div>
  );
}
