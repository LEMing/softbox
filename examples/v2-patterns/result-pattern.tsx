/**
 * Example: Result Pattern in ThreeDViewer v2.0
 * 
 * This example shows how managers use the Result pattern
 * for error handling instead of throwing exceptions.
 */

import React, { useEffect, useState } from 'react';
import { Result } from 'threedviewer/utils';
import { ThreeViewerError, ErrorCode } from 'threedviewer/errors';
import * as THREE from 'three';

// Example manager following the Result pattern
class ExampleManager {
  private scene: THREE.Scene | null = null;
  
  setup(scene: THREE.Scene): Result<void> {
    if (!scene) {
      return Result.err(
        new ThreeViewerError(
          'Scene is required for setup',
          ErrorCode.SCENE_INIT_FAILED
        )
      );
    }
    
    this.scene = scene;
    
    // Try to add lights
    const lightResult = this.addLighting();
    if (!lightResult.ok) {
      return lightResult;
    }
    
    // Try to add helpers
    const helperResult = this.addHelpers();
    if (!helperResult.ok) {
      return helperResult;
    }
    
    return Result.ok(undefined);
  }
  
  private addLighting(): Result<void> {
    if (!this.scene) {
      return Result.err(
        new ThreeViewerError(
          'Scene not initialized',
          ErrorCode.SCENE_INIT_FAILED
        )
      );
    }
    
    try {
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(5, 5, 5);
      
      this.scene.add(ambientLight);
      this.scene.add(directionalLight);
      
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        ThreeViewerError.fromError(
          error,
          ErrorCode.SCENE_INIT_FAILED,
          { phase: 'lighting' }
        )
      );
    }
  }
  
  private addHelpers(): Result<void> {
    return Result.wrap(() => {
      if (!this.scene) {
        throw new Error('Scene not initialized');
      }
      
      const axes = new THREE.AxesHelper(5);
      const grid = new THREE.GridHelper(10, 10);
      
      this.scene.add(axes);
      this.scene.add(grid);
    });
  }
  
  // Async operation returning Result
  async loadTexture(url: string): Promise<Result<THREE.Texture>> {
    try {
      const loader = new THREE.TextureLoader();
      const texture = await loader.loadAsync(url);
      return Result.ok(texture);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          `Failed to load texture: ${url}`,
          ErrorCode.TEXTURE_LOAD_FAILED,
          { url, originalError: error }
        )
      );
    }
  }
}

// React component demonstrating Result pattern usage
export function ResultPatternExample() {
  const [setupStatus, setSetupStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorDetails, setErrorDetails] = useState<ThreeViewerError | null>(null);
  const [textureStatus, setTextureStatus] = useState<string>('');

  // Example: Chaining Results
  const setupScene = () => {
    const scene = new THREE.Scene();
    const manager = new ExampleManager();
    
    // Setup manager
    const setupResult = manager.setup(scene);
    
    if (!setupResult.ok) {
      setSetupStatus('error');
      setErrorDetails(setupResult.error);
      console.error('Setup failed:', setupResult.error);
      return;
    }
    
    setSetupStatus('success');
    console.log('Setup succeeded!');
    
    // Load texture asynchronously
    loadTextureExample(manager);
  };

  // Example: Async Result handling
  const loadTextureExample = async (manager: ExampleManager) => {
    setTextureStatus('Loading texture...');
    
    const result = await manager.loadTexture('/textures/example.jpg');
    
    if (!result.ok) {
      setTextureStatus(`Texture load failed: ${result.error.message}`);
      return;
    }
    
    setTextureStatus(`Texture loaded: ${result.value.uuid}`);
  };

  // Example: Result.wrap for existing code
  const wrapExample = () => {
    const result = Result.wrap(() => {
      // This could throw
      const value = Math.random();
      if (value < 0.5) {
        throw new Error('Random failure');
      }
      return value;
    });
    
    if (result.ok) {
      console.log('Got value:', result.value);
    } else {
      console.error('Wrapped error:', result.error);
    }
  };

  // Example: Combining multiple Results
  const combineResults = () => {
    const results = [
      Result.ok(1),
      Result.ok(2),
      Result.err(new ThreeViewerError('Failed', ErrorCode.UNKNOWN)),
      Result.ok(3)
    ];
    
    // Find first error
    const firstError = results.find(r => !r.ok);
    if (firstError && !firstError.ok) {
      console.error('First error:', firstError.error);
    }
    
    // Collect all successful values
    const values = results
      .filter((r): r is { ok: true; value: number } => r.ok)
      .map(r => r.value);
    console.log('Successful values:', values);
  };

  // Example: Result transformation
  const transformResult = () => {
    const result: Result<number> = Result.ok(42);
    
    // Transform success value
    const doubled = result.ok 
      ? Result.ok(result.value * 2)
      : result;
    
    console.log('Transformed:', doubled);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Result Pattern Examples</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Basic Setup Example</h3>
        <button onClick={setupScene}>Setup Scene</button>
        <div>Status: {setupStatus}</div>
        {errorDetails && (
          <div style={{ color: 'red' }}>
            Error: {errorDetails.message} (Code: {errorDetails.code})
            <pre>{JSON.stringify(errorDetails.context, null, 2)}</pre>
          </div>
        )}
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Async Result Example</h3>
        <div>{textureStatus}</div>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Other Examples</h3>
        <button onClick={wrapExample}>Test Result.wrap</button>
        <button onClick={combineResults}>Combine Results</button>
        <button onClick={transformResult}>Transform Result</button>
      </div>
      
      <ResultPatternAdvanced />
    </div>
  );
}

// Advanced Result pattern utilities
export function ResultPatternAdvanced() {
  // Utility: Sequence Results
  const sequence = <T,>(results: Result<T>[]): Result<T[]> => {
    const values: T[] = [];
    
    for (const result of results) {
      if (!result.ok) {
        return Result.err(result.error);
      }
      values.push(result.value);
    }
    
    return Result.ok(values);
  };

  // Utility: Try all Results
  const tryAll = <T,>(results: Result<T>[]): { 
    successes: T[]; 
    failures: ThreeViewerError[] 
  } => {
    const successes: T[] = [];
    const failures: ThreeViewerError[] = [];
    
    for (const result of results) {
      if (result.ok) {
        successes.push(result.value);
      } else {
        failures.push(result.error);
      }
    }
    
    return { successes, failures };
  };

  // Example usage
  const runAdvancedExamples = () => {
    // Sequence example - fails on first error
    const sequenceResult = sequence([
      Result.ok(1),
      Result.ok(2),
      Result.err(new ThreeViewerError('Stop here', ErrorCode.UNKNOWN)),
      Result.ok(3) // Never reached
    ]);
    
    console.log('Sequence result:', sequenceResult);
    
    // Try all example - collects all results
    const tryAllResult = tryAll([
      Result.ok('A'),
      Result.err(new ThreeViewerError('Error B', ErrorCode.UNKNOWN)),
      Result.ok('C'),
      Result.err(new ThreeViewerError('Error D', ErrorCode.UNKNOWN))
    ]);
    
    console.log('Try all result:', tryAllResult);
  };

  // Practical example: Loading multiple resources
  const loadResources = async () => {
    const loadTasks = [
      loadResource('/model1.glb'),
      loadResource('/model2.glb'),
      loadResource('/texture1.jpg'),
      loadResource('/missing.file')
    ];
    
    const results = await Promise.all(loadTasks);
    const { successes, failures } = tryAll(results);
    
    console.log(`Loaded ${successes.length} resources`);
    console.log(`Failed to load ${failures.length} resources`);
    
    failures.forEach(error => {
      console.error(`Failed: ${error.context?.url} - ${error.message}`);
    });
  };

  // Mock resource loader
  const loadResource = async (url: string): Promise<Result<string>> => {
    // Simulate loading
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (url.includes('missing')) {
      return Result.err(
        new ThreeViewerError(
          `Resource not found: ${url}`,
          ErrorCode.RESOURCE_NOT_FOUND,
          { url }
        )
      );
    }
    
    return Result.ok(`Loaded: ${url}`);
  };

  return (
    <div>
      <h3>Advanced Result Patterns</h3>
      <button onClick={runAdvancedExamples}>Run Advanced Examples</button>
      <button onClick={loadResources}>Load Multiple Resources</button>
    </div>
  );
}

// Type guard example
export function isSuccessResult<T>(result: Result<T>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErrorResult<T>(result: Result<T>): result is { ok: false; error: ThreeViewerError } {
  return !result.ok;
}