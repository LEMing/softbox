import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import defaultOptions from '../defaultOptions';

/**
 * Default options for testing with path tracing disabled
 * to avoid creating multiple instances during tests
 */
const testDefaultOptions: SimpleViewerOptions = {
  ...defaultOptions,
  pathTracing: {
    ...defaultOptions.pathTracing!,
    enabled: false, // Disable path tracing in tests
  },
};

export default testDefaultOptions;