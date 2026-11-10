import * as THREE from 'three';

export const EXTERNALLY_OWNED_TEXTURES_FLAG = 'softboxExternallyOwnedTextures';

export const BACKGROUND_NODE_FLAG = 'softboxBackgroundNode';

export const STASHED_MATERIALS_KEY = 'softboxStashedMaterials';

export function disposeMaterial(material: THREE.Material): void {
  if (material.userData.softboxDisposed) {
    return;
  }
  if (!material.userData?.[EXTERNALLY_OWNED_TEXTURES_FLAG]) {
    const properties = material as unknown as Record<string, unknown>;
    for (const key of Object.keys(properties)) {
      const value = properties[key];
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    }
    const shader = material as THREE.ShaderMaterial;
    if (shader.isShaderMaterial && shader.uniforms) {
      for (const uniform of Object.values(shader.uniforms)) {
        if (uniform?.value instanceof THREE.Texture) {
          uniform.value.dispose();
        }
      }
    }
  }
  material.dispose();
  material.userData.softboxDisposed = true;
}

export function disposeBoundsTree(geometry: THREE.BufferGeometry): void {
  if (geometry.boundsTree) {
    geometry.boundsTree = undefined;
  }
}

export function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    const renderable = child as Partial<{
      geometry: THREE.BufferGeometry;
      material: THREE.Material | THREE.Material[];
    }>;

    if (renderable.geometry && typeof renderable.geometry.dispose === 'function') {
      disposeBoundsTree(renderable.geometry);
      renderable.geometry.dispose();
    }

    const material = renderable.material;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else if (material) {
      disposeMaterial(material);
    }

    const stashed = child.userData?.[STASHED_MATERIALS_KEY] as THREE.Material[] | undefined;
    stashed?.forEach(disposeMaterial);

    const light = child as THREE.Light & { shadow?: { dispose?: () => void } };
    if (light.isLight && light.shadow?.dispose) {
      light.shadow.dispose();
    }
  });
}

export interface DisposeSceneOptions {
  keepBackgrounds?: boolean;
}

export function disposeSceneContents(scene: THREE.Scene, options?: DisposeSceneOptions): void {
  if (!options?.keepBackgrounds) {
    if (scene.background instanceof THREE.Texture) {
      scene.background.dispose();
      scene.background = null;
    }
    if (scene.environment instanceof THREE.Texture) {
      scene.environment.dispose();
      scene.environment = null;
    }
    const sceneWithOriginal = scene as THREE.Scene & { __originalEnvironmentTexture?: THREE.Texture };
    if (sceneWithOriginal.__originalEnvironmentTexture) {
      sceneWithOriginal.__originalEnvironmentTexture = undefined;
    }
  }

  for (const child of [...scene.children]) {
    if (options?.keepBackgrounds && child.userData?.[BACKGROUND_NODE_FLAG]) {
      continue;
    }
    disposeObject3D(child);
    scene.remove(child);
  }
}
