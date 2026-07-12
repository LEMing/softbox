import React from 'react';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LoadingOverlay } from '../LoadingOverlay';

describe('LoadingOverlay', () => {
  it('renders the spinner and label while loading', () => {
    const { getByTestId, getByText, container } = render(
      <LoadingOverlay status="loading" label="Loading…" color="#fff" backdrop="rgba(0,0,0,0.4)" />
    );
    const overlay = getByTestId('viewer-loading-overlay');
    expect(overlay).toHaveAttribute('aria-busy', 'true');
    expect(getByText('Loading…')).toBeInTheDocument();
    // The spinner animates via SMIL (no external CSS needed).
    expect(container.querySelector('animateTransform')).toBeTruthy();
  });

  it('renders the error message without a spinner', () => {
    const { getByTestId, getByText, container } = render(
      <LoadingOverlay status="error" label="Failed to load model" color="#fff" backdrop="rgba(0,0,0,0.4)" />
    );
    expect(getByTestId('viewer-loading-overlay')).toHaveAttribute('aria-busy', 'false');
    expect(getByText('Failed to load model')).toBeInTheDocument();
    expect(container.querySelector('animateTransform')).toBeNull();
  });

  it('does not block pointer interaction with the canvas', () => {
    const { getByTestId } = render(
      <LoadingOverlay status="loading" label="x" color="#fff" backdrop="rgba(0,0,0,0.4)" />
    );
    expect(getByTestId('viewer-loading-overlay')).toHaveStyle({ pointerEvents: 'none' });
  });

  it('stops the spin live when prefers-reduced-motion flips mid-load', () => {
    let matches = false;
    let changeListener: (() => void) | null = null;
    const mediaQueryList = {
      get matches() {
        return matches;
      },
      addEventListener: jest.fn((_type: string, listener: () => void) => {
        changeListener = listener;
      }),
      removeEventListener: jest.fn(),
    };
    Object.defineProperty(window, 'matchMedia', {
      value: jest.fn(() => mediaQueryList),
      configurable: true,
    });
    try {
      const { container } = render(
        <LoadingOverlay status="loading" label="x" color="#fff" backdrop="rgba(0,0,0,0.4)" />
      );
      expect(container.querySelector('animateTransform')).toBeTruthy();

      matches = true;
      act(() => changeListener?.());

      expect(container.querySelector('animateTransform')).toBeNull();
    } finally {
      Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true });
    }
  });

  it('unsubscribes from the media query on unmount', () => {
    const mediaQueryList = {
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    Object.defineProperty(window, 'matchMedia', {
      value: jest.fn(() => mediaQueryList),
      configurable: true,
    });
    try {
      const { unmount } = render(
        <LoadingOverlay status="loading" label="x" color="#fff" backdrop="rgba(0,0,0,0.4)" />
      );
      unmount();
      expect(mediaQueryList.removeEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    } finally {
      Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true });
    }
  });
});
