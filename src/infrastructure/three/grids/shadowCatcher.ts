import * as THREE from 'three';
import {
  CONTACT_SHADOW_HELPER_FLAG,
  CONTACT_SHADOW_LIVE_NAME,
} from '../ContactShadowBaker';

export function createShadowCatcher(discRadius: number, opacity = 0.28): THREE.Mesh {
  const catcher = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(discRadius, 1), 64),
    new THREE.ShadowMaterial({ opacity })
  );
  catcher.name = CONTACT_SHADOW_LIVE_NAME;
  catcher.userData[CONTACT_SHADOW_HELPER_FLAG] = true;
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.002;
  catcher.receiveShadow = true;
  return catcher;
}
