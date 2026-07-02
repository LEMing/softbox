import { useEffect, useRef, useState } from 'react';

export interface DroppedModel {
  url: string;
  name: string;
}

const MODEL_EXTENSIONS = ['.glb', '.gltf'];

export function isModelFile(name: string): boolean {
  const lower = name.toLowerCase();
  return MODEL_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Window-level drag & drop of a local .glb/.gltf file. The dropped file is
 * exposed as an object URL (revoked when replaced or on unmount). `isDragging`
 * is true while a file hovers anywhere over the window, for a drop veil.
 */
export function useDropModel() {
  const [dropped, setDropped] = useState<DroppedModel | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // dragenter/dragleave fire per element; a counter tells apart "left the
  // window" from "moved between children".
  const dragDepthRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    };

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    const handleDragLeave = () => {
      dragDepthRef.current -= 1;
      if (dragDepthRef.current <= 0) {
        dragDepthRef.current = 0;
        setIsDragging(false);
      }
    };

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);

      const file = Array.from(event.dataTransfer?.files ?? []).find((candidate) =>
        isModelFile(candidate.name)
      );
      if (!file) {
        return;
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setDropped({ url, name: file.name });
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  return { dropped, isDragging };
}
