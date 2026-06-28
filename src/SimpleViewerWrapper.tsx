import React, { forwardRef } from 'react';
import { SimpleViewerProps } from './types';
import { SimpleViewer } from './presentation/components/SimpleViewer';
import type { SimpleViewerHandle } from './types/SimpleViewerHandle';

export type { SimpleViewerHandle };

/**
 * Public entry component for the viewer. Thin forwardRef pass-through to the
 * clean-architecture SimpleViewer implementation.
 */
const SimpleViewerWrapper = forwardRef<SimpleViewerHandle, SimpleViewerProps>(
  (props, ref) => {
    return <SimpleViewer ref={ref} {...props} />;
  }
);

SimpleViewerWrapper.displayName = 'SimpleViewer';

export default SimpleViewerWrapper;
