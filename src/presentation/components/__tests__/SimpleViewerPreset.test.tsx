import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimpleViewer } from '../SimpleViewer';
import { useViewerCore, useViewerEventHandlers } from '../../hooks';
import { SimpleViewerOptions } from '../../../types/SimpleViewerOptions';
import defaultOptions from '../../../defaultOptions';

jest.mock('../../hooks', () => ({
  useViewerCore: jest.fn(),
  useViewerEventHandlers: jest.fn(),
}));
jest.mock('threedgizmo', () => ({ Gizmo: () => null }));

const mockedUseViewerCore = useViewerCore as jest.Mock;

const optionsPassedToCore = (): SimpleViewerOptions =>
  mockedUseViewerCore.mock.calls[0][1] as SimpleViewerOptions;

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseViewerCore.mockReturnValue({ viewer: null, isInitialized: false });
  (useViewerEventHandlers as jest.Mock).mockImplementation(() => {});
});

describe('SimpleViewer preset prop', () => {
  it('folds the preset prop into the options passed to the core', () => {
    render(<SimpleViewer object={null} preset="dark" />);
    expect(optionsPassedToCore().preset).toBe('dark');
  });

  it('lets options.preset take precedence over the prop', () => {
    render(<SimpleViewer object={null} preset="dark" options={{ preset: 'studio' }} />);
    expect(optionsPassedToCore().preset).toBe('studio');
  });

  it('adds no preset when neither prop nor option is set', () => {
    render(<SimpleViewer object={null} options={{ backgroundColor: '#fff' }} />);
    expect(optionsPassedToCore().preset).toBeUndefined();
  });
});

describe('SimpleViewer pathTraced prop', () => {
  it('folds the pathTraced prop over the default path-tracing tuning', () => {
    render(<SimpleViewer object={null} pathTraced />);
    expect(optionsPassedToCore().pathTracing).toEqual({
      ...defaultOptions.pathTracing,
      enabled: true,
    });
  });

  it('composes with a partial options.pathTracing (tuning kept, enabled set)', () => {
    render(
      <SimpleViewer
        object={null}
        pathTraced
        options={{ pathTracing: { maxSamples: 64 } }}
      />
    );
    expect(optionsPassedToCore().pathTracing).toEqual({
      ...defaultOptions.pathTracing,
      maxSamples: 64,
      enabled: true,
    });
  });

  it('lets an explicit options.pathTracing.enabled win over the prop', () => {
    render(
      <SimpleViewer
        object={null}
        pathTraced
        options={{ pathTracing: { enabled: false } }}
      />
    );
    expect(optionsPassedToCore().pathTracing).toEqual({ enabled: false });
  });

  it('folds nothing for pathTraced={false} (same as omitting the prop)', () => {
    render(<SimpleViewer object={null} pathTraced={false} />);
    expect(optionsPassedToCore().pathTracing).toBeUndefined();
  });

  it('adds no pathTracing when neither prop nor option is set', () => {
    render(<SimpleViewer object={null} />);
    expect(optionsPassedToCore().pathTracing).toBeUndefined();
  });
});
