import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import SimpleViewer from './SimpleViewerWrapper';

const MODELS: Record<string, string> = {
  Lantern: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Lantern/glTF-Binary/Lantern.glb',
  Helmet: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
  WaterBottle: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/WaterBottle/glTF-Binary/WaterBottle.glb',
  Avocado: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb',
};

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const Picker = ({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#9a9aa5',
        minWidth: 58,
      }}
    >
      {label}
    </span>
    {items.map((item) => (
      <button
        key={item}
        onClick={() => onChange(item)}
        style={{
          padding: '6px 14px',
          borderRadius: 999,
          border: 'none',
          background: value === item ? '#111318' : 'transparent',
          color: value === item ? '#fff' : '#4a4a55',
          fontFamily: FONT,
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1,
          cursor: 'pointer',
          textTransform: 'capitalize',
          transition: 'background 120ms ease, color 120ms ease',
        }}
      >
        {item}
      </button>
    ))}
  </div>
);

const App = () => {
  const [model, setModel] = useState<string>('Lantern');

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '12px 14px',
          borderRadius: 14,
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
        }}
      >
        <Picker label="Model" items={Object.keys(MODELS)} value={model} onChange={setModel} />
      </div>

      {/* Preset switching is dogfooded through the library's own opt-in picker
          (`ui: { presets: true }`) — the same chips consumers get. */}
      <SimpleViewer object={MODELS[model]} options={{ ui: { presets: true } }} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
