import React from 'react';

type IconProps = { size?: number };

const svg = (size: number, children: React.ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const OrbitIcon = ({ size = 18 }: IconProps) =>
  svg(size, (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M20 12c0 2-3.6 3.6-8 3.6S4 14 4 12" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)" />
    </>
  ));

export const PanIcon = ({ size = 18 }: IconProps) =>
  svg(size, (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M12 3l-2.4 2.4M12 3l2.4 2.4M12 21l-2.4-2.4M12 21l2.4-2.4" />
      <path d="M3 12l2.4-2.4M3 12l2.4 2.4M21 12l-2.4-2.4M21 12l-2.4 2.4" />
    </>
  ));

export const ZoomIcon = ({ size = 18 }: IconProps) =>
  svg(size, (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5M10.5 8v5M8 10.5h5" />
    </>
  ));

export const CameraIcon = ({ size = 18 }: IconProps) =>
  svg(size, (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ));

export const FullscreenIcon = ({ size = 18 }: IconProps) =>
  svg(size, <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 0-1 1h-4" />);

export const FullscreenExitIcon = ({ size = 18 }: IconProps) =>
  svg(size, <path d="M9 4v3a1 1 0 0 1-1 1H5M15 4v3a1 1 0 0 0 1 1h3M9 20v-3a1 1 0 0 0-1-1H5M15 20v-3a1 1 0 0 1 1-1h3" />);

export const SettingsIcon = ({ size = 18 }: IconProps) =>
  svg(size, (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8l1.8-1.8M18 6l1.8-1.8" />
    </>
  ));

export const ModelIcon = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 3v18M4 7.5l8 4.5 8-4.5" />
    </>
  ));

export const CloseIcon = ({ size = 16 }: IconProps) =>
  svg(size, <path d="M6 6l12 12M18 6L6 18" />);
