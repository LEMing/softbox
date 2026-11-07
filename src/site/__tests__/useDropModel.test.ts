import { renderHook, act } from '@testing-library/react';
import { useDropModel, isModelFile } from '../useDropModel';

type DragLikeEvent = Event & { dataTransfer: { types: string[]; files: File[] } };

const dragEvent = (
  type: string,
  { files = [], types = ['Files'] }: { files?: File[]; types?: string[] } = {}
): DragLikeEvent => {
  const event = new Event(type, { cancelable: true }) as DragLikeEvent;
  event.dataTransfer = { types, files };
  return event;
};

const dispatch = (event: Event) => {
  act(() => {
    window.dispatchEvent(event);
  });
};

const dropFiles = (...names: string[]) => {
  dispatch(dragEvent('drop', { files: names.map((name) => new File(['x'], name)) }));
};

describe('isModelFile', () => {
  it('accepts only self-contained .glb files', () => {
    expect(isModelFile('model.glb')).toBe(true);
    expect(isModelFile('MODEL.GLB')).toBe(true);
    // A multi-file .gltf cannot resolve its external buffers from a blob URL.
    expect(isModelFile('scene.gltf')).toBe(false);
    expect(isModelFile('texture.png')).toBe(false);
  });
});

describe('useDropModel', () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let urlCounter: number;

  beforeEach(() => {
    urlCounter = 0;
    createObjectURL = jest.fn(() => `blob:mock-${++urlCounter}`);
    revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
  });

  it('exposes a dropped model file as an object URL', () => {
    const { result } = renderHook(() => useDropModel());
    dropFiles('rocket.glb');
    expect(result.current.dropped).toEqual({ url: 'blob:mock-1', name: 'rocket.glb' });
  });

  it('briefly reports a refused file instead of loading it', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useDropModel());
    dropFiles('photo.jpg');
    expect(result.current.dropped).toBeNull();
    expect(result.current.rejectedName).toBe('photo.jpg');
    expect(createObjectURL).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.rejectedName).toBeNull();
    jest.useRealTimers();
  });

  it('revokes the previous object URL when a new model is dropped', () => {
    const { result } = renderHook(() => useDropModel());
    dropFiles('first.glb');
    dropFiles('second.glb');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
    expect(result.current.dropped).toEqual({ url: 'blob:mock-2', name: 'second.glb' });
  });

  it('revokes the object URL on unmount', () => {
    const { unmount } = renderHook(() => useDropModel());
    dropFiles('model.glb');
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
  });

  it('loads a file handed over directly (file-input fallback)', () => {
    const { result } = renderHook(() => useDropModel());
    act(() => {
      result.current.loadFile(new File(['x'], 'chosen.glb'));
    });
    expect(result.current.dropped).toEqual({ url: 'blob:mock-1', name: 'chosen.glb' });
  });

  it('tracks dragging across nested enter/leave and clears it on drop', () => {
    const { result } = renderHook(() => useDropModel());

    dispatch(dragEvent('dragenter'));
    dispatch(dragEvent('dragenter'));
    expect(result.current.isDragging).toBe(true);

    dispatch(dragEvent('dragleave'));
    expect(result.current.isDragging).toBe(true);

    dispatch(dragEvent('dragleave'));
    expect(result.current.isDragging).toBe(false);

    dispatch(dragEvent('dragenter'));
    dropFiles('model.glb');
    expect(result.current.isDragging).toBe(false);
  });

  it('ignores in-page drags that carry no files (text selections, links)', () => {
    const { result } = renderHook(() => useDropModel());

    dispatch(dragEvent('dragenter', { types: ['text/plain'] }));
    expect(result.current.isDragging).toBe(false);

    const textDragOver = dragEvent('dragover', { types: ['text/uri-list'] });
    dispatch(textDragOver);
    expect(textDragOver.defaultPrevented).toBe(false);
  });

  it('prevents the browser default for file drags so drop can land', () => {
    renderHook(() => useDropModel());
    const fileDragOver = dragEvent('dragover');
    dispatch(fileDragOver);
    expect(fileDragOver.defaultPrevented).toBe(true);
  });
});
