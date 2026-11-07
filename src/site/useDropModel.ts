import { useCallback, useEffect, useRef, useState } from 'react';

export interface DroppedModel {
  url: string;
  name: string;
}

// Only self-contained .glb files: a multi-file .gltf references external
// buffers/textures by relative URI, which cannot resolve from a blob URL.
export function isModelFile(name: string): boolean {
  return name.toLowerCase().endsWith('.glb');
}

const isFileDrag = (event: DragEvent): boolean =>
  Boolean(event.dataTransfer?.types?.includes('Files'));

const REJECTION_NOTICE_MS = 2600;

/**
 * Loading a local model file: window-level drag & drop plus a `loadFile`
 * entry point for a file-input fallback (touch/keyboard users). The model is
 * exposed as an object URL (revoked when replaced or on unmount). `isDragging`
 * is true while a FILE drag hovers over the window (in-page text/link drags
 * are ignored); `rejectedName` briefly holds the name of a refused file.
 */
export function useDropModel() {
  const [dropped, setDropped] = useState<DroppedModel | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rejectedName, setRejectedName] = useState<string | null>(null);
  // dragenter/dragleave fire per element; a counter tells apart "left the
  // window" from "moved between children".
  const dragDepthRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const rejectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFile = useCallback((file: File) => {
    if (!isModelFile(file.name)) {
      setRejectedName(file.name);
      if (rejectionTimerRef.current) {
        clearTimeout(rejectionTimerRef.current);
      }
      rejectionTimerRef.current = setTimeout(() => setRejectedName(null), REJECTION_NOTICE_MS);
      return;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setRejectedName(null);
    setDropped({ url, name: file.name });
  }, []);

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      dragDepthRef.current -= 1;
      if (dragDepthRef.current <= 0) {
        dragDepthRef.current = 0;
        setIsDragging(false);
      }
    };

    const handleDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);

      const files = Array.from(event.dataTransfer?.files ?? []);
      const model = files.find((candidate) => isModelFile(candidate.name));
      const file = model ?? files[0];
      if (file) {
        loadFile(file);
      }
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
      if (rejectionTimerRef.current) {
        clearTimeout(rejectionTimerRef.current);
      }
    };
  }, [loadFile]);

  return { dropped, isDragging, rejectedName, loadFile };
}
