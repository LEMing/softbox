import { renderHook, act } from '@testing-library/react';
import { useDropModel, isModelFile } from '../useDropModel';

const dropFiles = (...names: string[]) => {
  const files = names.map((name) => new File(['x'], name));
  const event = new Event('drop') as Event & { dataTransfer: { files: File[] } };
  event.dataTransfer = { files };
  act(() => {
    window.dispatchEvent(event);
  });
};

describe('isModelFile', () => {
  it('accepts .glb and .gltf in any case, rejects everything else', () => {
    expect(isModelFile('model.glb')).toBe(true);
    expect(isModelFile('Scene.GLTF')).toBe(true);
    expect(isModelFile('texture.png')).toBe(false);
    expect(isModelFile('archive.zip')).toBe(false);
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

  it('ignores drops without a model file', () => {
    const { result } = renderHook(() => useDropModel());
    dropFiles('photo.jpg');
    expect(result.current.dropped).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
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

  it('tracks dragging across nested enter/leave and clears it on drop', () => {
    const { result } = renderHook(() => useDropModel());

    act(() => {
      window.dispatchEvent(new Event('dragenter'));
      window.dispatchEvent(new Event('dragenter'));
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('dragleave'));
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('dragleave'));
    });
    expect(result.current.isDragging).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('dragenter'));
    });
    dropFiles('model.glb');
    expect(result.current.isDragging).toBe(false);
  });
});
