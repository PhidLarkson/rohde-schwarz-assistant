declare module 'three/examples/jsm/loaders/GLTFLoader' {
  import { LoadingManager, Object3D } from 'three';

  export interface GLTF {
    scene: Object3D;
    scenes: Object3D[];
    animations?: any[];
    cameras?: any[];
    asset?: any;
  }

  export class GLTFLoader {
    constructor(manager?: LoadingManager);
    load(url: string, onLoad: (gltf: GLTF) => void, onProgress?: (ev: ProgressEvent) => void, onError?: (err: ErrorEvent | Error) => void): void;
  }

  export default GLTFLoader;
}

declare module 'three/examples/jsm/loaders/GLTFLoader.js' {
  export * from 'three/examples/jsm/loaders/GLTFLoader';
}
