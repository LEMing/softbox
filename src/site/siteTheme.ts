import type { CSSProperties } from 'react';
import { FONT, glassSurface } from '../presentation/components/theme';

export { FONT };

export const MONO_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

export const glassPanel: CSSProperties = {
  ...glassSurface,
  borderRadius: 14,
};
