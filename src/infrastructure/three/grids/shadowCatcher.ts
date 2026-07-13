import * as THREE from 'three';
import {
  CONTACT_SHADOW_HELPER_FLAG,
  CONTACT_SHADOW_LIVE_NAME,
} from '../ContactShadowBaker';

/**
 * The live contact-shadow catcher every floor style shares: an invisible
 * `ShadowMaterial` disc that only ever shows its shadowed area. It carries
 * the canonical name/flag so the baked ContactShadowBaker and the path
 * tracer's helper-hiding treat it identically regardless of the floor it
 * rides above; `addDynamicGrid` rescales its default lift to the model.
 */
export function createShadowCatcher(discRadius: number): THREE.Mesh {
  const catcher = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(discRadius, 1), 64),
    new THREE.ShadowMaterial({ opacity: 0.28 })
  );
  catcher.name = CONTACT_SHADOW_LIVE_NAME;
  catcher.userData[CONTACT_SHADOW_HELPER_FLAG] = true;
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.002;
  catcher.receiveShadow = true;
  return catcher;
}
