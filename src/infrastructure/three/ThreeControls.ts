import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MapControls } from 'three/examples/jsm/controls/MapControls';
import { IOrbitControls, IMapControls } from '../../core/interfaces/IControls';
import { IVector3 } from '../../core/interfaces/IObject3D';
import { ThreeVector3Adapter } from './ThreeVector3';
import * as THREE from 'three';

/**
 * Base adapter for Three.js controls
 */
abstract class ThreeControlsAdapter {
  protected targetAdapter: ThreeVector3Adapter;

  constructor(protected controls: OrbitControls | MapControls) {
    this.targetAdapter = ThreeVector3Adapter.fromThreeVector(controls.target);
  }

  get enabled(): boolean {
    return this.controls.enabled;
  }

  set enabled(value: boolean) {
    this.controls.enabled = value;
  }

  get enableDamping(): boolean {
    return this.controls.enableDamping;
  }

  set enableDamping(value: boolean) {
    this.controls.enableDamping = value;
  }

  get dampingFactor(): number {
    return this.controls.dampingFactor;
  }

  set dampingFactor(value: number) {
    this.controls.dampingFactor = value;
  }

  get enableZoom(): boolean {
    return this.controls.enableZoom;
  }

  set enableZoom(value: boolean) {
    this.controls.enableZoom = value;
  }

  get enableRotate(): boolean {
    return this.controls.enableRotate;
  }

  set enableRotate(value: boolean) {
    this.controls.enableRotate = value;
  }

  get enablePan(): boolean {
    return this.controls.enablePan;
  }

  set enablePan(value: boolean) {
    this.controls.enablePan = value;
  }

  get zoomSpeed(): number {
    return this.controls.zoomSpeed;
  }

  set zoomSpeed(value: number) {
    this.controls.zoomSpeed = value;
  }

  get minDistance(): number {
    return this.controls.minDistance;
  }

  set minDistance(value: number) {
    this.controls.minDistance = value;
  }

  get maxDistance(): number {
    return this.controls.maxDistance;
  }

  set maxDistance(value: number) {
    this.controls.maxDistance = value;
  }

  get rotateSpeed(): number {
    return this.controls.rotateSpeed;
  }

  set rotateSpeed(value: number) {
    this.controls.rotateSpeed = value;
  }

  get minPolarAngle(): number {
    return this.controls.minPolarAngle;
  }

  set minPolarAngle(value: number) {
    this.controls.minPolarAngle = value;
  }

  get maxPolarAngle(): number {
    return this.controls.maxPolarAngle;
  }

  set maxPolarAngle(value: number) {
    this.controls.maxPolarAngle = value;
  }

  get minAzimuthAngle(): number {
    return this.controls.minAzimuthAngle;
  }

  set minAzimuthAngle(value: number) {
    this.controls.minAzimuthAngle = value;
  }

  get maxAzimuthAngle(): number {
    return this.controls.maxAzimuthAngle;
  }

  set maxAzimuthAngle(value: number) {
    this.controls.maxAzimuthAngle = value;
  }

  get panSpeed(): number {
    return this.controls.panSpeed;
  }

  set panSpeed(value: number) {
    this.controls.panSpeed = value;
  }

  get screenSpacePanning(): boolean {
    return this.controls.screenSpacePanning;
  }

  set screenSpacePanning(value: boolean) {
    this.controls.screenSpacePanning = value;
  }

  get target(): IVector3 {
    return this.targetAdapter;
  }

  update(): boolean {
    return this.controls.update();
  }

  reset(): void {
    this.controls.reset();
  }

  dispose(): void {
    this.controls.dispose();
  }

  connect(_domElement: HTMLElement): void {
    // Three.js controls connect automatically in constructor
    // This method is for compatibility with our interface
  }

  disconnect(): void {
    this.controls.dispose();
  }

  getThreeControls(): OrbitControls | MapControls {
    return this.controls;
  }
}

/**
 * Adapter for Three.js OrbitControls
 */
export class ThreeOrbitControlsAdapter extends ThreeControlsAdapter implements IOrbitControls {
  private orbitControls: OrbitControls;

  constructor(camera: THREE.Camera, domElement: HTMLElement) {
    const controls = new OrbitControls(camera, domElement);
    super(controls);
    this.orbitControls = controls;
  }

  get type(): 'orbit' {
    return 'orbit';
  }

  get autoRotate(): boolean {
    return this.orbitControls.autoRotate;
  }

  set autoRotate(value: boolean) {
    this.orbitControls.autoRotate = value;
  }

  get autoRotateSpeed(): number {
    return this.orbitControls.autoRotateSpeed;
  }

  set autoRotateSpeed(value: number) {
    this.orbitControls.autoRotateSpeed = value;
  }
}

/**
 * Adapter for Three.js MapControls
 */
export class ThreeMapControlsAdapter extends ThreeControlsAdapter implements IMapControls {
  constructor(camera: THREE.Camera, domElement: HTMLElement) {
    const controls = new MapControls(camera, domElement);
    super(controls);
    // MapControls always use screen space panning
    controls.screenSpacePanning = true;
  }

  get type(): 'map' {
    return 'map';
  }

  get screenSpacePanning(): true {
    return true;
  }

  set screenSpacePanning(value: true) {
    // MapControls always use screen space panning
  }
}