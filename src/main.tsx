import React from 'react';
import ReactDOM from 'react-dom/client';
import SimpleViewer from './SimpleViewerWrapper';
import defaultOptions from './defaultOptions';

const App = () => {
  const models = [
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/TextureCoordinateTest/glTF-Binary/TextureCoordinateTest.glb",
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMan/glTF-Binary/CesiumMan.glb",
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb",
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Lantern/glTF-Binary/Lantern.glb",
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/WaterBottle/glTF-Binary/WaterBottle.glb",
  ];


  const randomModel = models[Math.floor(Math.random() * models.length)];
  const MODEL_URL = randomModel || "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb";
  const options = {
    ...defaultOptions,
    environment: {
      url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/industrial_sunset_puresky.jpg',
      backgroundBlurriness: 0.05,
      backgroundIntensity: 1,
      environmentIntensity: 0.5,
    }
  } as const;

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <SimpleViewer
        object={MODEL_URL}
        options={options}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
