import * as THREE from 'three';
import FloorAligner from '../infrastructure/three/FloorAligner';

describe('FloorAligner', () => {
  let mockMesh: THREE.Mesh;

  beforeEach(() => {
    // Create a mock mesh before each test
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshBasicMaterial();
    mockMesh = new THREE.Mesh(geometry, material);

    // Manually set the bounding box
    mockMesh.geometry.computeBoundingBox();
    if (mockMesh.geometry.boundingBox) {
      mockMesh.geometry.boundingBox.min.set(-1, -1, -1);
      mockMesh.geometry.boundingBox.max.set(1, 1, 1);
    }
  });

  test('should align object with pivot at bottom', () => {
    mockMesh.position.set(0, 2, 0);
    const aligner = new FloorAligner(mockMesh);
    aligner.alignToFloor();
    expect(mockMesh.position.y).toBe(1);
  });

  test('should align object with pivot at top', () => {
    mockMesh.position.set(0, -2, 0);
    const aligner = new FloorAligner(mockMesh);
    aligner.alignToFloor();
    expect(mockMesh.position.y).toBe(1);
  });

  test('should align object with pivot in center', () => {
    mockMesh.position.set(0, 0, 0);
    const aligner = new FloorAligner(mockMesh);
    aligner.alignToFloor();
    expect(mockMesh.position.y).toBe(1);
  });

  test('should not change x and z positions', () => {
    mockMesh.position.set(5, 2, -3);
    const aligner = new FloorAligner(mockMesh);
    aligner.alignToFloor();
    expect(mockMesh.position.x).toBe(5);
    expect(mockMesh.position.z).toBe(-3);
  });

  test('should handle flat objects', () => {
    const flatGeometry = new THREE.PlaneGeometry(2, 2);
    mockMesh.geometry = flatGeometry;
    mockMesh.geometry.computeBoundingBox();
    if (mockMesh.geometry.boundingBox) {
      mockMesh.geometry.boundingBox.min.set(-1, 0, -1);
      mockMesh.geometry.boundingBox.max.set(1, 0, 1);
    }
    mockMesh.position.set(0, 2, 0);
    const aligner = new FloorAligner(mockMesh);
    aligner.alignToFloor();
    expect(mockMesh.position.y).toBe(2);
  });

  test('should handle objects already on the floor', () => {
    mockMesh.position.set(0, 1, 0);
    const aligner = new FloorAligner(mockMesh);
    aligner.alignToFloor();
    expect(mockMesh.position.y).toBe(1);
  });
});
