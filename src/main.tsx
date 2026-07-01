import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import SimpleViewer from './SimpleViewerWrapper';
import { ViewerPreset } from './types/options';

const MODELS: Record<string, string> = {
  Lantern: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Lantern/glTF-Binary/Lantern.glb',
  Helmet: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
  WaterBottle: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/WaterBottle/glTF-Binary/WaterBottle.glb',
  Avocado: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb',
};

const PRESETS: ViewerPreset[] = ['studio', 'product', 'neutral', 'dark', 'outdoor', 'photoreal'];

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
    <span style={{ fontSize: 12, color: '#888', minWidth: 52 }}>{label}</span>
    {items.map((item) => (
      <button
        key={item}
        onClick={() => onChange(item)}
        style={{
          padding: '5px 12px',
          borderRadius: 999,
          border: '1px solid ' + (value === item ? '#4f7cff' : '#d0d0d8'),
          background: value === item ? '#4f7cff' : '#fff',
          color: value === item ? '#fff' : '#333',
          fontSize: 13,
          cursor: 'pointer',
          textTransform: 'capitalize',
        }}
      >
        {item}
      </button>
    ))}
  </div>
);

const App = () => {
  const [model, setModel] = useState<string>('Lantern');
  const [preset, setPreset] = useState<ViewerPreset>('studio');

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 12,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        }}
      >
        <Picker label="Model" items={Object.keys(MODELS)} value={model} onChange={setModel} />
        <Picker label="Preset" items={PRESETS} value={preset} onChange={(v) => setPreset(v as ViewerPreset)} />
      </div>

      {/* Only `preset` is passed — the library applies its defaults internally,
          so switching presets actually changes the look (passing the full
          defaultOptions here would shallow-override every preset field). */}
      <SimpleViewer object={MODELS[model]} preset={preset} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
