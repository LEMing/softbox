import * as THREE from 'three';
import { disposeMaterial, disposeObject3D, disposeSceneContents } from '../disposal';
import { buildRaycastBvh } from '../bvh';

describe('disposal', () => {
  describe('disposeMaterial', () => {
    it('disposes the material and every texture it references', () => {
      const material = new THREE.MeshStandardMaterial();
      const map = new THREE.Texture();
      const normalMap = new THREE.Texture();
      const roughnessMap = new THREE.Texture();
      material.map = map;
      material.normalMap = normalMap;
      material.roughnessMap = roughnessMap;

      const matSpy = jest.spyOn(material, 'dispose');
      const mapSpy = jest.spyOn(map, 'dispose');
      const normalSpy = jest.spyOn(normalMap, 'dispose');
      const roughSpy = jest.spyOn(roughnessMap, 'dispose');

      disposeMaterial(material);

      expect(matSpy).toHaveBeenCalledTimes(1);
      expect(mapSpy).toHaveBeenCalledTimes(1);
      expect(normalSpy).toHaveBeenCalledTimes(1);
      expect(roughSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('disposeObject3D', () => {
    it('disposes geometry, materials and their textures across the hierarchy', () => {
      const geometry = new THREE.BoxGeometry();
      const material = new THREE.MeshStandardMaterial();
      const map = new THREE.Texture();
      material.map = map;
      const mesh = new THREE.Mesh(geometry, material);

      const group = new THREE.Group();
      group.add(mesh);

      const geomSpy = jest.spyOn(geometry, 'dispose');
      const matSpy = jest.spyOn(material, 'dispose');
      const mapSpy = jest.spyOn(map, 'dispose');

      disposeObject3D(group);

      expect(geomSpy).toHaveBeenCalledTimes(1);
      expect(matSpy).toHaveBeenCalledTimes(1);
      expect(mapSpy).toHaveBeenCalledTimes(1);
    });

    it('disposes each material of a multi-material mesh', () => {
      const material1 = new THREE.MeshBasicMaterial();
      const material2 = new THREE.MeshBasicMaterial();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [material1, material2]);

      const spy1 = jest.spyOn(material1, 'dispose');
      const spy2 = jest.spyOn(material2, 'dispose');

      disposeObject3D(mesh);

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });

    it('disposes light shadow resources', () => {
      const light = new THREE.DirectionalLight();
      const shadowSpy = jest.spyOn(light.shadow, 'dispose');

      disposeObject3D(light);

      expect(shadowSpy).toHaveBeenCalledTimes(1);
    });

    it('disposes non-mesh renderables (lines, e.g. wire grids and axes helpers)', () => {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.LineBasicMaterial();
      const line = new THREE.LineSegments(geometry, material);

      const geomSpy = jest.spyOn(geometry, 'dispose');
      const matSpy = jest.spyOn(material, 'dispose');

      disposeObject3D(line);

      expect(geomSpy).toHaveBeenCalledTimes(1);
      expect(matSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('disposeMaterial shader uniforms', () => {
    it('disposes textures held inside ShaderMaterial uniforms', () => {
      const texture = new THREE.Texture();
      const disposeSpy = jest.spyOn(texture, 'dispose');
      const material = new THREE.ShaderMaterial({
        uniforms: { map: { value: texture }, strength: { value: 0.5 } },
      });

      disposeMaterial(material);

      expect(disposeSpy).toHaveBeenCalled();
    });
  });

  describe('disposeObject3D bounds tree', () => {
    it('releases the raycast BVH together with the geometry', () => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      buildRaycastBvh(mesh);
      expect(mesh.geometry.boundsTree).toBeTruthy();

      disposeObject3D(mesh);

      expect(mesh.geometry.boundsTree).toBeUndefined();
    });
  });

  describe('disposeSceneContents', () => {
    it('disposes background/environment textures and detaches all children', () => {
      const scene = new THREE.Scene();
      const background = new THREE.Texture();
      const environment = new THREE.Texture();
      scene.background = background;
      scene.environment = environment;

      const geometry = new THREE.BoxGeometry();
      const material = new THREE.MeshBasicMaterial();
      scene.add(new THREE.Mesh(geometry, material));

      const bgSpy = jest.spyOn(background, 'dispose');
      const envSpy = jest.spyOn(environment, 'dispose');
      const geomSpy = jest.spyOn(geometry, 'dispose');
      const matSpy = jest.spyOn(material, 'dispose');

      disposeSceneContents(scene);

      expect(bgSpy).toHaveBeenCalledTimes(1);
      expect(envSpy).toHaveBeenCalledTimes(1);
      expect(geomSpy).toHaveBeenCalledTimes(1);
      expect(matSpy).toHaveBeenCalledTimes(1);
      expect(scene.background).toBeNull();
      expect(scene.environment).toBeNull();
      expect(scene.children).toHaveLength(0);
    });

    it('leaves a color background untouched', () => {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);

      expect(() => disposeSceneContents(scene)).not.toThrow();
      expect(scene.background).toBeInstanceOf(THREE.Color);
    });

    it('keeps background/environment textures when keepBackgrounds is set', () => {
      const scene = new THREE.Scene();
      const background = new THREE.Texture();
      const environment = new THREE.Texture();
      scene.background = background;
      scene.environment = environment;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      scene.add(mesh);

      const bgSpy = jest.spyOn(background, 'dispose');
      const envSpy = jest.spyOn(environment, 'dispose');

      disposeSceneContents(scene, { keepBackgrounds: true });

      expect(bgSpy).not.toHaveBeenCalled();
      expect(envSpy).not.toHaveBeenCalled();
      expect(scene.background).toBe(background);
      expect(scene.environment).toBe(environment);
      // Children are still detached/disposed.
      expect(scene.children).toHaveLength(0);
    });

    it('clears the path tracer __originalEnvironmentTexture back-reference', () => {
      const scene = new THREE.Scene() as THREE.Scene & {
        __originalEnvironmentTexture?: THREE.Texture;
      };
      scene.__originalEnvironmentTexture = new THREE.Texture();

      disposeSceneContents(scene);

      expect(scene.__originalEnvironmentTexture).toBeUndefined();
    });

    it('keeps the __originalEnvironmentTexture back-reference when keepBackgrounds is set', () => {
      const scene = new THREE.Scene() as THREE.Scene & {
        __originalEnvironmentTexture?: THREE.Texture;
      };
      const original = new THREE.Texture();
      scene.__originalEnvironmentTexture = original;

      disposeSceneContents(scene, { keepBackgrounds: true });

      expect(scene.__originalEnvironmentTexture).toBe(original);
    });
  });
});
