import * as THREE from 'three';
import { applyInteractionMode } from '../interactionMode';

const makeControls = () => ({
  mouseButtons: { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN },
  touches: { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN },
});

describe('applyInteractionMode', () => {
  it('maps orbit to rotate on the primary drag', () => {
    const c = makeControls();
    applyInteractionMode(c, 'orbit');
    expect(c.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
    expect(c.touches.ONE).toBe(THREE.TOUCH.ROTATE);
  });

  it('maps pan to pan on the primary drag', () => {
    const c = makeControls();
    applyInteractionMode(c, 'pan');
    expect(c.mouseButtons.LEFT).toBe(THREE.MOUSE.PAN);
    expect(c.touches.ONE).toBe(THREE.TOUCH.PAN);
  });

  it('maps zoom to dolly on the primary drag', () => {
    const c = makeControls();
    applyInteractionMode(c, 'zoom');
    expect(c.mouseButtons.LEFT).toBe(THREE.MOUSE.DOLLY);
    expect(c.touches.ONE).toBe(THREE.TOUCH.DOLLY_PAN);
  });

  it('leaves the secondary bindings untouched', () => {
    const c = makeControls();
    applyInteractionMode(c, 'pan');
    expect(c.mouseButtons.RIGHT).toBe(THREE.MOUSE.PAN);
    expect(c.mouseButtons.MIDDLE).toBe(THREE.MOUSE.DOLLY);
    expect(c.touches.TWO).toBe(THREE.TOUCH.DOLLY_PAN);
  });

  it('is a no-op for null / non-remappable controls', () => {
    expect(() => applyInteractionMode(null, 'orbit')).not.toThrow();
    expect(() => applyInteractionMode({}, 'pan')).not.toThrow();
  });
});
