import React, { forwardRef } from 'react';
import { SimpleViewerProps } from './types';
import { SimpleViewer } from './presentation/components/SimpleViewer';
import type { SimpleViewerHandle } from './types/SimpleViewerHandle';

export type { SimpleViewerHandle };

const SimpleViewerWrapper = forwardRef<SimpleViewerHandle, SimpleViewerProps>(
  (props, ref) => {
    return <SimpleViewer ref={ref} {...props} />;
  }
);

SimpleViewerWrapper.displayName = 'SimpleViewer';

export default SimpleViewerWrapper;
