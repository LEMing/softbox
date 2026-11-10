import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import defaultOptions from '../defaultOptions';

const testDefaultOptions: SimpleViewerOptions = {
  ...defaultOptions,
  pathTracing: {
    ...(defaultOptions.pathTracing ?? {}),
    enabled: false,
  },
};

export default testDefaultOptions;