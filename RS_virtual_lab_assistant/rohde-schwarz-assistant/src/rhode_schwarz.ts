import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { transcribeAudio, translateText, askGemini, textToSpeech } from './genai';
import { AudioRecorder } from './audioRecorder';
import { AudioFeedback } from './audioFeedback';
import manifest from './animation-manifest.json';

export type RhodeSchwarzState = 'READY' | 'LISTENING' | 'PROCESSING' | 'SPEAKING';

export class RhodeSchwarzAssistant {
  // Animation system
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private idleAnimations: THREE.AnimationAction[] = [];
  private currentIdleIndex: number = 0;

  // New Animation Categories
  private danceAnimations: THREE.AnimationAction[] = [];
  private currentDanceIndex: number = 0;

  private exprAnimations: THREE.AnimationAction[] = [];
  private currentExprIndex: number = 0;

  private locoAnimations: THREE.AnimationAction[] = [];
  private currentLocoIndex: number = 0;

  private talkingAction: THREE.AnimationAction | null = null;
  private danceAction: THREE.AnimationAction | null = null;

  private currentAction: THREE.AnimationAction | null = null;
  private isDancing: boolean = false;

  public getGroundY(): number {
    return this.groundY ?? 0;
  }
  private leftArmBone: THREE.Object3D | null = null;
  private rightArmBone: THREE.Object3D | null = null;
  private headBone: THREE.Object3D | null = null;
  private headBaseRotationX: number = 0;

  // Blinking state
  private blinkStartTime: number = Date.now();
  private blinkPeriod: number = 4.5; // Will be set once after model loads
  private leftEyeMesh: THREE.Mesh | null = null;
  private rightEyeMesh: THREE.Mesh | null = null;
  private eyeObjects: Set<THREE.Object3D> = new Set(); // Use Set to avoid duplicates

  private mouthMesh: THREE.Mesh | null = null;
  private mouthMorphIndex: number | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array | null = null;
  private mouthAnimatorId: number | null = null;

  // Movement + positioning state
  private autoFollow = false;
  private groundY: number | null = null;
  private tmpVecA = new THREE.Vector3();
  private tmpVecB = new THREE.Vector3();
  private tmpVecC = new THREE.Vector3();

  // Speech recognition helpers
  private audioRecorder = new AudioRecorder();
  private audioFeedback = new AudioFeedback();
  private currentState: RhodeSchwarzState = 'READY';
  private muted: boolean = false;
  private silenceMonitorId: number | null = null;
  private silenceIntervalId: number | null = null;
  private speechThreshold: number = 0.025;
  private silenceRequiredMs: number = 1200; // ms of silence after speech to auto-stop
  private hasHeardSpeechWhileRecording: boolean = false;
  private fastMode: boolean = false; // when true, short-circuit UI delays and use tighter silence timing
  private isRecording: boolean = false;
  private statusLabel: string = 'READY';


  /**
   * Cycle to the next available idle animation for previewing.
   */
  public cycleIdleAnimation() {
    if (this.idleAnimations.length <= 1) return;

    // Stop current
    if (this.idleAction) {
      this.idleAction.fadeOut(0.5);
    }

    // Advance index
    this.currentIdleIndex = (this.currentIdleIndex + 1) % this.idleAnimations.length;
    const newIdle = this.idleAnimations[this.currentIdleIndex];

    if (newIdle) {
      this.idleAction = newIdle;
      // If currently in READY state (not talking/dancing), fade in new idle immediately
      if (this.currentState === 'READY' && !this.isDancing) {
        newIdle.reset().fadeIn(0.5).play();
        this.currentAction = newIdle;
      }
      const name = newIdle.getClip().name;
      console.log('🔄 Switched to idle ID:', this.currentIdleIndex, 'Name:', name);
      this.setStatusLabel(`Idle: ${name.replace('F_Standing_Idle_', '')}`);

      // Clear label after 3s
      setTimeout(() => {
        if (this.statusLabel.startsWith('Idle:')) this.setStatusLabel('READY');
      }, 3000);
    }
  }



  public cycleDance() {
    if (this.danceAnimations.length === 0) return;

    // Stop current
    if (this.currentAction) {
      this.currentAction.fadeOut(0.3);
    }

    this.currentDanceIndex = (this.currentDanceIndex + 1) % this.danceAnimations.length;
    const action = this.danceAnimations[this.currentDanceIndex];
    this.isDancing = true;

    action.reset().fadeIn(0.3).play();
    this.currentAction = action;

    const name = action.getClip().name;
    this.setStatusLabel(`Dance: ${name}`);
    console.log('💃 Cycling dance:', name);
  }

  public cycleExpression() {
    if (this.exprAnimations.length === 0) return;

    // Stop current
    if (this.currentAction) {
      this.currentAction.fadeOut(0.3);
    }
    this.isDancing = false;

    this.currentExprIndex = (this.currentExprIndex + 1) % this.exprAnimations.length;
    const action = this.exprAnimations[this.currentExprIndex];

    action.reset().fadeIn(0.3).play();
    this.currentAction = action;

    const name = action.getClip().name;
    this.setStatusLabel(`Expr: ${name}`);
    console.log('😐 Cycling expression:', name);
  }

  public cycleLocomotion() {
    if (this.locoAnimations.length === 0) return;

    // Stop current
    if (this.currentAction) {
      this.currentAction.fadeOut(0.3);
    }
    this.isDancing = false;

    this.currentLocoIndex = (this.currentLocoIndex + 1) % this.locoAnimations.length;
    const action = this.locoAnimations[this.currentLocoIndex];

    action.reset().fadeIn(0.3).play();
    this.currentAction = action;

    const name = action.getClip().name;
    this.setStatusLabel(`Walk: ${name}`);
    console.log('🚶 Cycling locomotion:', name);
  }

  public mesh: THREE.Group | null = null;
  private scene: THREE.Scene;
  public lastResponse: string = "";
  public currentTranscript: string = "";

  // Caption system removed; rely on dashboard status only

  // Audio context for XR-compatible playback
  private audioContext: AudioContext | null = null;
  private currentAudioSource: AudioBufferSourceNode | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // Expose auto-follow state for UI to read (DashboardSystem reads this)
  public isAutoFollowEnabled(): boolean {
    return !!this.autoFollow;
  }

  // Load the GLB model from the public folder
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      // Use absolute public path so Vite serves from /gltf
      loader.load('/gltf/rhode_schwarz-character.glb', (gltf: any) => {
        this.mesh = gltf.scene as THREE.Group;
        // Add to scene first so Box3 can calculate correctly
        this.scene.add(this.mesh);

        // Default position in front of user; will be adjusted by world code
        this.mesh.position.set(0, 0, -1);

        // If the caller passed a camera earlier (we don't have it here), scaling
        // will be adjusted from index.ts by calling `fitToHeight` in the system.
        // Set a conservative default scale
        this.mesh.scale.set(1, 1, 1);

        // Find all bones and meshes for animation and interaction
        console.log('🔍 Scanning GLB model structure...');
        let armBoneCount = 0;
        this.mesh.traverse((child: any) => {
          if (!child.name) return;

          if (child.isBone) {
            // ... existing bone logic if needed, but keeping it brief to focus on meshes
            if (/left.*arm/i.test(child.name)) this.leftArmBone = child;
            if (/right.*arm/i.test(child.name)) this.rightArmBone = child;
            if (/head/i.test(child.name)) {
              this.headBone = child;
              this.headBaseRotationX = child.rotation.x || 0;
              console.log('  ✅ HEAD BONE found:', child.name);
            }
            if (/jaw|teeth/i.test(child.name) && child.isBone) {
              console.log('  🦴 JAW/TEETH BONE found:', child.name);
            }
          }

          if (child.isMesh) {
            // Log if it has morph targets
            if (child.morphTargetDictionary) {
              console.log(`  🗿 MESH WITH MORPHS: "${child.name}"`);
              console.log(`     KEYS: ${Object.keys(child.morphTargetDictionary).join(', ')}`);

              // Heuristic: If this mesh has "Head" or "Body" or "Face" in name, it's likely the one we want
              // OR if it has keys like "mouthOpen", "JawOpen"
              const keys = Object.keys(child.morphTargetDictionary);
              const hasMouthMorph = keys.some(k => /mouth|jaw|open/i.test(k));

              if (hasMouthMorph && (/head|face|body/i.test(child.name) || keys.length > 5)) {
                this.mouthMesh = child;
                // Find best morph
                const bestKey = keys.find(k => /jaw.*open/i.test(k)) ||
                  keys.find(k => /mouth.*open/i.test(k)) ||
                  keys.find(k => /open/i.test(k)) ||
                  keys[0];

                if (bestKey) {
                  this.mouthMorphIndex = child.morphTargetDictionary[bestKey];
                  console.log(`  ✅ SELECTED MOUTH MESH: "${child.name}" using morph "${bestKey}" (index ${this.mouthMorphIndex})`);
                }
              }
            }

            // Auto-detect eyes for blinking (existing logic)
            if (/left.*eye/i.test(child.name)) { this.leftEyeMesh = child; this.eyeObjects.add(child); }
            else if (/right.*eye/i.test(child.name)) { this.rightEyeMesh = child; this.eyeObjects.add(child); }
            else if (/eye/i.test(child.name)) { this.eyeObjects.add(child); }
          }
        });
        this.blinkPeriod = 4.5 + Math.random() * 1.5;

        // Load animations
        this.loadAnimations().then(() => {
          console.log('✅ Animations loaded successfully');

          // Auto-detect immersive/VR user agents to enable fastMode for snappier pipeline
          try {
            const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
            if (/oculus|quest|meta|vr|xr/i.test(ua)) {
              this.setFastMode(true);
              console.log('🛰️ Immersive UA detected - fastMode enabled');
            }
          } catch (e) {
            // ignore
          }

          // After loading model and animations, attempt to auto-start listening if not muted.
          // This will prompt for mic permission on first run.
          (async () => {
            try {
              if (!this.muted) {
                await this.startListening();
              }
            } catch (err) {
              console.warn('⚠️ Auto-start listening failed (permissions?):', err);
              // Inform UI that mic permission is required / awaiting user gesture
              this.setStatusLabel('Press UNMUTE to start');
            }
          })();
          resolve();
        }).catch((err) => {
          console.warn('⚠️ Failed to load animations, continuing without them:', err);
          resolve(); // Still resolve even if animations fail
        });
      }, undefined, (err: any) => {
        console.error('Failed to load rhode_schwarz-character.glb', err);
        reject(err);
      });
    });
  }

  // Load idle and talking animations
  private async loadAnimations(): Promise<void> {
    if (!this.mesh) {
      throw new Error('Mesh not loaded yet');
    }

    // Create animation mixer
    this.mixer = new THREE.AnimationMixer(this.mesh);
    console.log('🎬 Loading animations...');

    const loader = new GLTFLoader();

    // Load animations from manifest
    // LAZY LOAD: Load only the first idle animation critically to unblock startup
    const idleFiles = manifest.idle || [];
    if (idleFiles.length > 0) {
      console.log('🎬 Loading primary idle:', idleFiles[0]);
      try {
        const path = idleFiles[0];
        const gltf = await new Promise<any>((resolve, reject) => {
          loader.load(path, resolve, undefined, reject);
        });
        if (gltf.animations && gltf.animations.length > 0) {
          const clip = gltf.animations[0];
          const name = path.split('/').pop()?.replace('.glb', '') || clip.name;
          clip.name = name;

          const action = this.mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          this.idleAnimations.push(action);
          this.idleAction = action; // Set as primary immediately

          // Start playing immediately if we have it
          if (this.currentAction === null) {
            this.idleAction.play();
            this.currentAction = this.idleAction;
            console.log('▶️ Quick-start: Playing primary idle');
          }
        }
      } catch (e) {
        console.warn('⚠️ Failed to critical load idle:', e);
      }
    }

    // Trigger background loading for everything else
    this.loadBackgroundAnimations(loader, idleFiles.slice(1));
  }

  // Load remainder of animations without blocking the main promise
  private async loadBackgroundAnimations(loader: GLTFLoader, remainingIdleFiles: string[]) {
    console.log('⏳ Starting background animation load...');

    // Load remaining idle variations
    for (const path of remainingIdleFiles) {
      try {
        const gltf = await new Promise<any>((resolve) => loader.load(path, resolve));
        if (gltf.animations && gltf.animations.length > 0) {
          const clip = gltf.animations[0];
          const name = path.split('/').pop()?.replace('.glb', '') || clip.name;
          clip.name = name;
          const action = this.mixer!.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          this.idleAnimations.push(action);
        }
      } catch (e) { }
    }

    // --- DANCE ANIMATIONS ---
    const danceFiles = manifest.dance || [];
    for (const path of danceFiles) {
      try {
        const gltf = await new Promise<any>((resolve) => loader.load(path, resolve));
        if (gltf.animations && gltf.animations.length > 0) {
          const clip = gltf.animations[0];
          clip.name = path.split('/').pop()?.replace('.glb', '') || clip.name;
          const action = this.mixer!.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          this.danceAnimations.push(action);
        }
      } catch (e) { }
    }

    // --- EXPRESSION ANIMATIONS ---
    const exprFiles = manifest.expression || [];
    for (const path of exprFiles) {
      try {
        const gltf = await new Promise<any>((resolve) => loader.load(path, resolve));
        if (gltf.animations && gltf.animations.length > 0) {
          const clip = gltf.animations[0];
          clip.name = path.split('/').pop()?.replace('.glb', '') || clip.name;
          const action = this.mixer!.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          this.exprAnimations.push(action);
        }
      } catch (e) { }
    }

    // --- LOCOMOTION ANIMATIONS ---
    const locoFiles = manifest.locomotion || [];
    for (const path of locoFiles) {
      try {
        const gltf = await new Promise<any>((resolve) => loader.load(path, resolve));
        if (gltf.animations && gltf.animations.length > 0) {
          const clip = gltf.animations[0];
          clip.name = path.split('/').pop()?.replace('.glb', '') || clip.name;
          const action = this.mixer!.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          this.locoAnimations.push(action);
        }
      } catch (e) { }
    }

    // Assign defaults if available
    if (this.danceAnimations.length > 0) this.danceAction = this.danceAnimations[0];
    if (this.exprAnimations.length > 0) this.talkingAction = this.exprAnimations[0];

    console.log(`✅ Background load complete. Total Idle: ${this.idleAnimations.length}, Dance: ${this.danceAnimations.length}`);
  }

  // Switch between animations with smooth crossfade
  private switchAnimation(toAction: THREE.AnimationAction | null, duration: number = 0.3) {
    if (!toAction || toAction === this.currentAction) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(duration);
    }

    toAction.reset().fadeIn(duration).play();
    this.currentAction = toAction;
  }

  // Public method to toggle dance
  public toggleDance() {
    if (this.isDancing) {
      // Stop dancing, return to idle
      if (this.idleAction) {
        this.switchAnimation(this.idleAction, 0.5);
      }
      this.isDancing = false;
      console.log('🎬 Stopped dancing');
    } else {
      // Start dancing
      if (this.danceAction) {
        this.switchAnimation(this.danceAction, 0.5);
      }
      this.isDancing = true;
      console.log('💃 Started dancing!');
    }
    return this.isDancing;
  }

  // Face the camera each frame
  update(camera: THREE.Camera) {
    if (!this.mesh) return;

    // Update animation mixer
    const delta = 0.016; // ~60fps
    if (this.mixer) {
      this.mixer.update(delta);
    }

    // Keep only Y rotation so model stays upright
    const worldPos = new THREE.Vector3();
    camera.getWorldPosition(worldPos);
    const target = new THREE.Vector3(worldPos.x, this.mesh.position.y, worldPos.z);
    this.mesh.lookAt(target);

    // --- Blinking ---
    const blinkElapsed = (Date.now() - this.blinkStartTime) / 1000;
    const blinkPhase = blinkElapsed % this.blinkPeriod;
    const isBinking = blinkPhase < 0.15; // 0.15s blink duration

    // Set visibility for BOTH eyes
    if (this.leftEyeMesh) this.leftEyeMesh.visible = !isBinking;
    if (this.rightEyeMesh) this.rightEyeMesh.visible = !isBinking;

    // Also hide all eye objects found during traversal
    for (const eye of this.eyeObjects) {
      eye.visible = !isBinking;
    }

    // --- Procedural Head Tracking ---
    this.updateHeadTracking(camera, delta);

    if (this.autoFollow) {
      const ground = this.groundY ?? (this.mesh ? this.mesh.position.y : 0);
      this.followTowardsCamera(camera, ground);
    }
  }

  // State for procedural animation
  private currentLookAt = new THREE.Vector3();
  private lookAtTarget = new THREE.Vector3();
  private glanceTimer = 0;
  private isGlancing = false;
  private headVelocity = new THREE.Vector3(); // for smooth damping

  private updateHeadTracking(camera: THREE.Camera, delta: number) {
    if (!this.headBone || !this.mesh) return;

    // 1. Determine Target to look at
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);

    // Default: Look at camera (user's eyes)
    let target = camPos.clone();

    // Occasional random glances (only in READY/Idle state)
    if (this.currentState === 'READY' && !this.isDancing) {
      this.glanceTimer -= delta;
      if (this.glanceTimer <= 0) {
        // Toggle glance
        this.isGlancing = !this.isGlancing;
        this.glanceTimer = this.isGlancing ? 1.5 + Math.random() : 5 + Math.random() * 5;

        if (this.isGlancing) {
          // Pick a random point ~2m away 
          const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 1
          );
          this.lookAtTarget.copy(target).add(offset);
        }
      }

      if (!this.isGlancing) {
        this.lookAtTarget.copy(target); // Snap target back to camera
      }
    } else {
      // Always look at user when Listening, Processing, or Speaking
      this.isGlancing = false;
      this.lookAtTarget.copy(target);
    }

    // Smoothly interpolate current look point
    const lerpSpeed = this.isGlancing ? 2.0 : 5.0; // Faster returning to eye contact
    this.currentLookAt.lerp(this.lookAtTarget, lerpSpeed * delta);

    // 2. Limit rotation to avoid "Owl Head"
    // Convert world target to local space relative to body
    const localTarget = this.currentLookAt.clone();
    this.mesh.worldToLocal(localTarget);

    // Calculate simple yaw/pitch
    let yaw = Math.atan2(localTarget.x, localTarget.z);
    let pitch = Math.atan2(localTarget.y, localTarget.z);

    // Clamp angles (e.g. +/- 60 degrees)
    const limit = Math.PI / 3;
    yaw = Math.max(-limit, Math.min(limit, yaw));
    pitch = Math.max(-0.5, Math.min(0.5, pitch)); // Less pitch

    // 3. Apply rotation to Head Bone (additive to animation)
    // We want to Rotate the head bone to face the yaw/pitch, 
    // BUT preserve the existing animation's influence (which is usually minimal on head in idle).
    // A simple method is to set rotation directly if we don't need complex blending.
    // Given 'Head' rotation logs: x ~ -0.1 (Base pose).

    // NOTE: This overrides the animation clip's head rotation. 
    // For a simple 'LookAt', we can apply Euler offsets.

    const baseHeadRotX = -0.1; // Extracted from logs

    // Apply state-specific offsets
    let tiltZ = 0; // EarthTilt
    let leanX = 0; // Forward lean

    if (this.currentState === 'LISTENING') {
      // Lean forward slightly and tilt ear to camera
      leanX = 0.15;
      tiltZ = 0.1;
    } else if (this.currentState === 'SPEAKING') {
      // Subtle head bob generated by sin wave
      leanX = Math.sin(Date.now() / 150) * 0.02;
    }

    // Smoothly set rotation
    // Note: Bone coordinate systems vary. Assuming Standard Rig (Y-Up, Z-Forward usually, but Mixamo is often different)
    // Based on logs: LeftEye Rot X is -0.14. Head is -0.1.
    // We will apply yaw to Y axis, Pitch to X axis.

    // We dampen changes to the bone to handle the frame-by-frame updates
    const q = new THREE.Quaternion();
    // Order YXZ is typical for head yaw/pitch
    q.setFromEuler(new THREE.Euler(baseHeadRotX - pitch + leanX, yaw, tiltZ, 'YXZ'));

    // Slerp current bone rotation towards calculated LookAt rotation
    // This blends animation (if any) with our procedural LookAt if we did it right,
    // but here we are overwriting. To blend, we'd multiply. Overwriting is cleaner for "LookAt" control.
    this.headBone.quaternion.slerp(q, 8 * delta);
  }

  public bringToCamera(camera: THREE.Camera, groundY?: number) {
    if (!this.mesh) return;
    const camPos = this.tmpVecA;
    camera.getWorldPosition(camPos);
    const forward = this.tmpVecB;
    camera.getWorldDirection(forward);
    forward.normalize();
    forward.multiplyScalar(1.6);
    const desired = this.tmpVecC.copy(camPos).add(forward);
    const targetY = groundY ?? this.groundY ?? this.mesh.position.y;
    desired.y = targetY;
    this.mesh.position.copy(desired);
    this.mesh.lookAt(camPos.x, targetY, camPos.z);
  }

  public resetConversation() {
    this.lastResponse = "";
    this.currentTranscript = "";
    this.stopListening();
  }

  public toggleAutoFollow(): boolean {
    this.autoFollow = !this.autoFollow;
    return this.autoFollow;
  }

  public setGroundY(y: number) {
    this.groundY = y;
  }

  public isProcessing(): boolean {
    return this.currentState === 'PROCESSING';
  }

  public getState(): RhodeSchwarzState {
    return this.currentState;
  }

  public isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  public getStatusLabel(): string {
    return this.statusLabel;
  }

  private setStatusLabel(label: string) {
    if (this.statusLabel === label) return;
    this.statusLabel = label;
    console.log(`📊 [RHODE_SCHWARZ][FLOW] ${label}`);
  }

  /**
   * Get current audio level for visualizer (0-1)
   */
  public getAudioLevel(): number {
    return this.audioRecorder.getAudioLevel();
  }

  public onTouched() {
    console.log('👆 Rhoda was touched!');
    this.audioFeedback.click();
    if (this.currentState === 'READY') {
      void this.startListening();
    }
  }

  public summon(camera: THREE.Camera, groundY: number) {
    this.audioFeedback.click();
    this.bringToCamera(camera, groundY);
    console.log('📍 Rhoda summoned to camera');
  }

  // Greeting removed - will be replaced with new implementation

  public async startListening() {
    // Prevent starting if not in READY state
    if (this.currentState !== 'READY') {
      console.warn('⚠️ [RHODE_SCHWARZ] Cannot start - current state:', this.currentState);
      return;
    }

    console.log('🎤 [RHODE_SCHWARZ] Starting listening mode...');
    this.setStatusLabel('Listening...');

    // Update state immediately
    this.currentState = 'LISTENING';
    this.isRecording = true;
    this.setListeningVisual(true);
    this.audioFeedback.listening();

    try {
      // Start the recorder
      await this.audioRecorder.start();
      console.log('✅ [RHODE_SCHWARZ] Recording started successfully');
      this.setStatusLabel('Listening...');
      // Reset speech detection helpers
      this.hasHeardSpeechWhileRecording = false;
      let silenceStart: number | null = null;

      // Create a single-check function so we can run it from RAF and from a setInterval fallback
      const checkSilenceOnce = () => {
        try {
          if (this.currentState !== 'LISTENING' || !this.isRecording) {
            return;
          }

          const level = this.audioRecorder.getAudioLevel();
          // Debug: occasionally log level in immersive flows to diagnose issues
          if (this.fastMode && level > 0.001) {
            console.log('🔎 [SILENCE-MONITOR] audio level:', level.toFixed(3));
          }
          const now = Date.now();

          // If user speaks above threshold, register speech and clear silence timer
          if (level >= this.speechThreshold) {
            this.hasHeardSpeechWhileRecording = true;
            silenceStart = null;
            if (this.fastMode) console.log('🔊 [SILENCE-MONITOR] detected speech (level', level.toFixed(3), ')');
          } else {
            // If we've heard speech before, start silence timer
            if (this.hasHeardSpeechWhileRecording) {
              if (silenceStart === null) silenceStart = now;
              const elapsed = now - (silenceStart || now);
              const required = this.fastMode ? Math.max(400, Math.floor(this.silenceRequiredMs / 2)) : this.silenceRequiredMs;
              if (elapsed >= required) {
                console.log('🔕 Detected silence for', elapsed, 'ms (required', required, ') → auto-stopping recording');
                // Fire stopListening asynchronously to avoid reentrancy here
                void this.stopListening();
                return;
              }
            }
          }
        } catch (e) {
          // ignore occasional errors from analyser
        }
      };

      // RAF loop (normal path)
      const rafLoop = () => {
        checkSilenceOnce();
        // only queue next RAF when still in listening state
        if (this.currentState === 'LISTENING' && this.isRecording) {
          this.silenceMonitorId = requestAnimationFrame(rafLoop);
        } else if (this.silenceMonitorId) {
          cancelAnimationFrame(this.silenceMonitorId);
          this.silenceMonitorId = null;
        }
      };

      // Start both RAF and an interval fallback (some XR runtimes suspend RAF)
      this.silenceMonitorId = requestAnimationFrame(rafLoop);
      // Interval runs slightly slower but ensures checks when RAF is unavailable/suspended
      this.silenceIntervalId = window.setInterval(() => {
        if (this.currentState === 'LISTENING' && this.isRecording) {
          checkSilenceOnce();
        }
      }, 150);

      // Caption removed

    } catch (error) {
      // Recording failed - reset to READY
      console.error('❌ [RHODE_SCHWARZ] Failed to start recording:', error);

      this.currentState = 'READY';
      this.isRecording = false;
      this.setListeningVisual(false);
      this.audioFeedback.error();
      this.setStatusLabel('Microphone error');

      const errorMsg = (error as Error).message || 'Unknown error';
    }
  }

  public async stopListening() {
    // Only stop if actually recording
    if (this.currentState !== 'LISTENING' || !this.isRecording) {
      console.warn('⚠️ [RHODE_SCHWARZ] Not recording - cannot stop');
      return;
    }

    console.log('🛑 [RHODE_SCHWARZ] Stopping recording...');

    // Update state to PROCESSING
    this.isRecording = false;
    this.setListeningVisual(false);
    this.currentState = 'PROCESSING';
    this.audioFeedback.processing();
    this.setStatusLabel('Thinking...');

    try {
      const audioBlob: Blob = await this.audioRecorder.stop();
      // Ensure monitor stopped
      if (this.silenceMonitorId) {
        cancelAnimationFrame(this.silenceMonitorId);
        this.silenceMonitorId = null;
      }
      if (this.silenceIntervalId) {
        clearInterval(this.silenceIntervalId);
        this.silenceIntervalId = null;
      }
      console.log(`✅ [RHODE_SCHWARZ] Got audio blob: ${audioBlob.size} bytes, ${audioBlob.type}`);
      await this.processConversation(audioBlob);
    } catch (error) {
      this.handlePipelineError(error);
    }
  }

  private async processConversation(audioBlob: Blob) {
    console.log(`🔄 [RHODE_SCHWARZ] ========== PIPELINE START ==========`);
    console.log(`🔄 [RHODE_SCHWARZ] Audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('No audio captured from microphone');
    }

    const sizeKb = (audioBlob.size / 1024).toFixed(1);
    // Simplified status: keep showing "Thinking..." instead of file size details
    this.setStatusLabel('Thinking...');

    // 1) Transcribe Twi
    console.log(`📤 [RHODE_SCHWARZ] ========== STEP 1: TRANSCRIPTION (Twi) ==========`);
    this.setStatusLabel('Thinking...');

    let twiTranscript: string;
    try {
      const transcriptStart = Date.now();
      twiTranscript = await transcribeAudio(audioBlob, 'tw');
      const transcriptTime = Date.now() - transcriptStart;
      this.currentTranscript = twiTranscript;
      console.log(`✅ [RHODE_SCHWARZ] Twi transcript (${transcriptTime}ms): "${twiTranscript}"`);

      // Show the transcript result
      // Simplified: don't show raw transcript, just keep thinking
      // this.setStatusLabel(...);
    } catch (transcribeError) {
      const errMsg = (transcribeError as Error).message;
      if (errMsg.includes('No transcription text') || errMsg.includes('Empty transcription')) {
        console.warn('⚠️ [RHODE_SCHWARZ] No speech detected in audio');
        this.setStatusLabel('Listening...');
        this.currentState = 'READY';
        this.setListeningVisual(false);
        this.audioFeedback.ready();

        // Auto-resume listening after a moment
        if (!this.muted) {
          setTimeout(() => this.startListening(), 500);
        }
        return;
      }
      console.error('❌ [RHODE_SCHWARZ] Transcription failed:', transcribeError);
      throw new Error(`STT failed: ${errMsg}`);
    }

    // 2) Translate Twi → English
    console.log(`📤 [RHODE_SCHWARZ] ========== STEP 2: TRANSLATION (Twi → EN) ==========`);
    this.setStatusLabel('Thinking...');

    // Validate we have text to translate
    if (!twiTranscript || twiTranscript.trim().length === 0) {
      throw new Error('Cannot translate empty transcript. Please speak clearly and try again.');
    }

    const translateStart = Date.now();
    const englishText = await translateText(twiTranscript, 'tw', 'en');
    const translateTime = Date.now() - translateStart;
    console.log(`✅ [RHODE_SCHWARZ] English translation (${translateTime}ms): "${englishText}"`);

    // Validate translation result
    if (!englishText || englishText.trim().length === 0 || englishText === 'undefined') {
      throw new Error('Translation returned empty result. Please try again.');
    }

    // Show the translation result
    // Show the translation result
    this.setStatusLabel('Thinking...');

    // 3) Ask Gemini in English
    console.log(`📤 [RHODE_SCHWARZ] ========== STEP 3: AI GENERATION (Gemini) ==========`);
    this.setStatusLabel('Thinking...');

    const geminiStart = Date.now();
    const englishResponse = await askGemini(englishText);
    const geminiTime = Date.now() - geminiStart;
    console.log(`✅ [RHODE_SCHWARZ] Gemini response (${geminiTime}ms): "${englishResponse}"`);

    // Show the AI response
    // Keep thinking...
    // this.setStatusLabel(...);

    // 4) Translate Gemini response EN → Twi
    console.log(`📤 [RHODE_SCHWARZ] ========== STEP 4: TRANSLATION (EN → Twi) ==========`);
    this.setStatusLabel('Thinking...');

    // Validate we have AI response to translate
    if (!englishResponse || englishResponse.trim().length === 0) {
      throw new Error('AI returned empty response. Please try again.');
    }

    const translateBackStart = Date.now();
    const twiResponse = await translateText(englishResponse, 'en', 'tw');
    const translateBackTime = Date.now() - translateBackStart;
    this.lastResponse = twiResponse;
    console.log(`✅ [RHODE_SCHWARZ] Twi response (${translateBackTime}ms): "${twiResponse}"`);

    // Validate final translation
    if (!twiResponse || twiResponse.trim().length === 0 || twiResponse === 'undefined') {
      throw new Error('Final translation returned empty result. Please try again.');
    }

    // Show the final Twi response
    // Show the final Twi response
    // Ready to speak!
    this.setStatusLabel('Thinking...');

    // 5) Speak Twi via GhanaNLP TTS
    console.log(`📤 [RHODE_SCHWARZ] ========== STEP 5: TEXT-TO-SPEECH ==========`);
    await this.speak(twiResponse, 'tw');

    console.log(`✅ [RHODE_SCHWARZ] ========== PIPELINE COMPLETE ==========`);
  }

  private handlePipelineError(error: unknown) {
    console.error('❌ [RHODE_SCHWARZ] Pipeline error:', error);
    console.error('❌ [RHODE_SCHWARZ] Error stack:', (error as Error)?.stack);

    const message = (error as Error)?.message || 'Unknown error';

    // Show more of the error message in the status
    const shortMessage = message.length > 80 ? message.substring(0, 80) + '...' : message;

    this.currentState = 'READY';
    this.audioFeedback.error();
    this.setSpeakingVisual(false);
    this.setStatusLabel(`❌ ${shortMessage}`);

    // Keep error visible for 10 seconds before resetting to READY
    console.log(`⏰ [RHODE_SCHWARZ] Error will clear in 10 seconds`);
    setTimeout(() => {
      if (this.statusLabel.startsWith('❌') || this.statusLabel.startsWith('ERROR:')) {
        console.log(`⏰ [RHODE_SCHWARZ] Clearing error status`);
        this.setStatusLabel('READY');
      }
    }, 10000);
  }

  // Fast-mode controls: when enabled we shorten silence windows for snappier recording
  public setFastMode(enabled: boolean) {
    this.fastMode = !!enabled;
    // tighten silence window when in fast mode
    this.silenceRequiredMs = this.fastMode ? 600 : 1200;
  }

  private async speak(text: string, language: string = 'tw') {
    this.currentState = 'SPEAKING';
    this.setSpeakingVisual(true);
    this.audioFeedback.speaking();
    this.setStatusLabel('Speaking...');

    // Stay in idle while generating audio
    console.log('🎬 Staying in idle while generating TTS audio...');

    try {
      // Generate speech using GhanaNLP TTS
      const audioBlob = await textToSpeech(text, language);
      if (!audioBlob) {
        console.warn('⚠️ No TTS audio generated');
        this.currentState = 'READY';
        this.setSpeakingVisual(false);
        this.audioFeedback.ready();
        this.setStatusLabel('Sorry, I cannot speak right now');
        return;
      }

      // Use Web Audio API for XR-compatible playback
      // Animation switching happens inside playAudioBlob
      this.setStatusLabel('Speaking...');
      await this.playAudioBlob(audioBlob);

      console.log('✅ TTS playback finished');
      this.currentState = 'READY';
      this.setSpeakingVisual(false);
      this.audioFeedback.ready();
      this.setStatusLabel('READY');

      // After speaking completes, automatically resume listening if not muted
      try {
        if (!this.muted) {
          // small delay so UI updates first
          setTimeout(() => {
            void this.startListening();
          }, 400);
        }
      } catch (e) {
        console.warn('⚠️ Failed to auto-resume listening after speaking:', e);
      }
    } catch (err) {
      console.error('❌ TTS error:', err);
      this.currentState = 'READY';
      this.setSpeakingVisual(false);
      this.audioFeedback.error();
      this.setStatusLabel('Message failed');

      // Switch back to idle on error (unless dancing)
      if (this.idleAction && !this.isDancing) {
        this.switchAnimation(this.idleAction, 0.5);
      }
    }
  }

  /**
   * Play audio blob using Web Audio API (works in XR and browser).
   */
  private async playAudioBlob(blob: Blob): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🎵 playAudioBlob called with blob:', blob.size, 'bytes, type:', blob.type);

        // Initialize audio context if needed
        if (!this.audioContext) {
          this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          console.log('🎵 Created new AudioContext, state:', this.audioContext.state);
        }

        // Resume context if suspended (required for autoplay policies on mobile)
        if (this.audioContext.state === 'suspended') {
          console.log('⚠️ AudioContext suspended, attempting resume...');
          await this.audioContext.resume();
          console.log('🎵 AudioContext resumed, new state:', this.audioContext.state);
        }

        // Stop any currently playing audio
        if (this.currentAudioSource) {
          try {
            this.currentAudioSource.stop();
            console.log('🛑 Stopped previous audio source');
          } catch (e) { /* ignore */ }
        }

        // Convert blob to array buffer
        console.log('📦 Converting blob to ArrayBuffer...');
        const arrayBuffer = await blob.arrayBuffer();
        console.log('✅ ArrayBuffer size:', arrayBuffer.byteLength, 'bytes');

        // Decode audio data
        console.log('🔊 Decoding audio data...');
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        console.log('✅ Audio decoded - Duration:', audioBuffer.duration.toFixed(2), 's, Channels:', audioBuffer.numberOfChannels, 'Sample Rate:', audioBuffer.sampleRate);

        // Create source and connect to destination
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;

        // Create gain node for volume control (helps with mobile)
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 1.0; // Full volume

        source.connect(gainNode);

        // Create an analyser so we can drive mouth movement from audio data
        try {
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 1024;
          this.analyser.smoothingTimeConstant = 0.15; // Balanced smoothing (not too twitchy, not too laggy)
          gainNode.connect(this.analyser);
          this.analyser.connect(this.audioContext.destination);
          this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);
        } catch (e) {
          console.warn('⚠️ Failed to create AnalyserNode', e);
          gainNode.connect(this.audioContext.destination);
        }

        source.onended = () => {
          console.log('✅ Audio playback ended');
          this.currentAudioSource = null;
          if (this.mouthAnimatorId) {
            cancelAnimationFrame(this.mouthAnimatorId);
            this.mouthAnimatorId = null;
          }
          // Reset mouth to closed state
          if (this.mouthMesh) {
            try {
              if (this.mouthMorphIndex !== null && Array.isArray((this.mouthMesh as any).morphTargetInfluences)) {
                (this.mouthMesh as any).morphTargetInfluences[this.mouthMorphIndex] = 0;
              }
              this.mouthMesh.scale.set(1, 1, 1);
            } catch (e) { /* ignore */ }
          }

          if (this.idleAction && !this.isDancing) {
            this.switchAnimation(this.idleAction, 0.5);
          }
          resolve();
        };

        this.currentAudioSource = source;

        if (this.talkingAction && !this.isDancing) {
          this.switchAnimation(this.talkingAction, 0.2);
        }

        // --- NATURAL LIP SYNC ANIMATOR ---
        if (this.analyser && this.analyserData && this.mouthMesh) {
          const animateMouth = () => {
            try {
              // We use time domain (waveform) for immediate amplitude syncing
              this.analyser!.getByteTimeDomainData(this.analyserData as any);

              let sum = 0;
              const len = this.analyserData!.length;
              for (let i = 0; i < len; i++) {
                // Waveform is 0..255, center is 128.
                sum += Math.abs(this.analyserData![i] - 128);
              }

              // Raw average amplitude (0..128)
              const avg = sum / len;

              // Gentle normalization
              const norm = avg / 35.0;

              // Mild curve: reduced aggressive opening
              // Use square root to sensitize low volumes without blowing out high volumes
              let targetOpen = Math.min(0.7, Math.sqrt(norm) * 0.9);

              // Apply to Morph Target
              if (this.mouthMorphIndex !== null && Array.isArray((this.mouthMesh as any).morphTargetInfluences)) {
                // Apply directly without noise
                // We trust the analyser's smoothingTimeConstant (0.15) to handle the jitter
                (this.mouthMesh as any).morphTargetInfluences[this.mouthMorphIndex] = targetOpen;

              } else {
                // FALLBACK: Scale Based Animation (if no morphs found)
                // Gentle scaling
                const openY = 1 + targetOpen * 0.8;
                this.mouthMesh!.scale.set(1, openY, 1);
              }
            } catch (e) {
              // ignore
            }
            this.mouthAnimatorId = requestAnimationFrame(animateMouth);
          };
          this.mouthAnimatorId = requestAnimationFrame(animateMouth);
        }

        source.start(0);

        console.log('🔊 Playing TTS audio via Web Audio API');
        console.log('📱 AudioContext state:', this.audioContext.state);
      } catch (err) {
        console.error('❌ Audio playback error:', err);
        console.error('Error name:', (err as Error).name);
        console.error('Error message:', (err as Error).message);

        // Fallback: Try HTML5 Audio as last resort for mobile
        console.warn('🔄 Attempting fallback to HTML5 Audio element...');
        try {
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            console.log('✅ Audio playback ended (HTML5 fallback)');
            resolve();
          };
          audio.onerror = (e) => {
            URL.revokeObjectURL(audioUrl);
            console.error('❌ HTML5 Audio fallback also failed:', e);
            reject(new Error('Both Web Audio API and HTML5 Audio failed'));
          };
          await audio.play();
          console.log('🔊 Playing via HTML5 Audio (fallback)');
        } catch (fallbackErr) {
          console.error('❌ Fallback also failed:', fallbackErr);
          reject(err);
        }
      }
    });
  }

  // Visual feedback helper: tint emissive color when listening
  private setListeningVisual(on: boolean) {
    // Disabled: no emissive tinting; keep only blinking overlay visuals elsewhere
  }

  // When user is actively speaking, glow eyes yellow and start nodding
  private setSpeakingVisual(on: boolean) {
    if (!this.mesh) return;
    // Disabled: no emissive tinting or manual nodding — rely on imported talking animations
  }

  // Set auto-follow explicitly (used by DashboardSystem)
  public setAutoFollow(enabled: boolean) {
    this.autoFollow = !!enabled;
  }

  // Expose current auto-follow state for external UI sync

  private followTowardsCamera(camera: THREE.Camera, groundY: number) {
    if (!this.mesh) return;
    const camPos = this.tmpVecA;
    camera.getWorldPosition(camPos);
    const current = this.mesh.position;
    const direction = this.tmpVecB.copy(camPos).sub(current);
    const distance = direction.length();
    const threshold = 2;
    if (distance <= threshold) {
      // Stop locomotion immediately when we stop approaching
      // BUT do not force idle while speaking — allow talking animation to play during speech
      const speaking = this.currentState === 'SPEAKING';
      if (this.idleAction && this.currentAction !== this.idleAction && !this.isDancing && !speaking) {
        this.switchAnimation(this.idleAction, 0.3);
        console.log('🧍 Stopped approaching → back to idle');
      }
      return;
    }
    direction.normalize();
    const desired = this.tmpVecC.copy(camPos).sub(direction.multiplyScalar(1.6));
    desired.y = groundY;
    current.lerp(desired, 0.08);
    this.mesh.lookAt(camPos.x, groundY, camPos.z);

    // Locomotion animation removed: do not switch animations while approaching.
    // We keep the current animation (idle/talking/dance) and simply lerp position toward the camera.
  }

  public async startRecording() {
    // Wrapper to align older calls with the new unified listening workflow
    await this.startListening();
  }

  public async stopRecording() {
    // Wrapper to align older calls with the new unified listening workflow
    await this.stopListening();
  }

  // Mute controls
  public isMuted(): boolean {
    return !!this.muted;
  }

  public setMuted(value: boolean) {
    this.muted = !!value;
    console.log(`🔇 Rhoda muted: ${this.muted}`);
    if (this.muted) {
      // if currently listening, stop
      if (this.currentState === 'LISTENING' && this.isRecording) {
        void this.stopListening();
      }
    } else {
      // If unmuted and READY, start listening
      if (this.currentState === 'READY') {
        (async () => {
          try {
            await this.startListening();
          } catch (err) {
            console.warn('⚠️ Failed to auto-start listening on unmute:', err);
            try { this.setStatusLabel('AWAITING_MIC: Press Unmute'); } catch (e) { /* ignore */ }
          }
        })();
      }
    }
  }
}