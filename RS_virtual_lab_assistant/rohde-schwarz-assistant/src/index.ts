import {
  World,
  createSystem,
  SessionMode,
  OneHandGrabbable,
  XRPlane,
  PanelUI,
  PanelUISystem,
  Interactable,
} from "@iwsdk/core";
import * as THREE from 'three';

import { RhodeSchwarzAssistant } from "./rhode_schwarz";
import { DashboardSystem } from "./dashboard";
import { HandRaySystem } from "./handRay";

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    offer: "always",
    features: {
      handTracking: true,
      anchors: true,
      hitTest: true,
      planeDetection: true,
      meshDetection: true,
      layers: true,
    },
  },
  features: {
    physics: false, // Disabled to prevent crashes
    grabbing: true,
    sceneUnderstanding: true,
    locomotion: false,
  },
}).then(async (world) => {
  // --- Rhoda Lab Assistant Logic Starts Here ---
  const rhodeSchwarz = new RhodeSchwarzAssistant(world.scene);
  await rhodeSchwarz.init();

  // 3. Add her to the scene
  if (rhodeSchwarz.mesh) {

    const rhodeSchwarzEntity = world.createTransformEntity(rhodeSchwarz.mesh);
    // Initial position: 1.2m in front of camera, feet on ground, scaled to 1.8m (5'11")
    try {
      // Compute model bounding box and current height
      const bbox = new THREE.Box3().setFromObject(rhodeSchwarz.mesh);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const modelHeight = size.y || 1;

      // Desired height: 1.68m (5'6")
      const desiredHeight = 1.68;
      const scale = desiredHeight / modelHeight;
      rhodeSchwarz.mesh.scale.setScalar(scale);

      // After scaling, recompute bounding box and shift so the model's lowest point sits on y=0 (ground)
      const bbox2 = new THREE.Box3().setFromObject(rhodeSchwarz.mesh);
      const minY = bbox2.min.y;

      // Default camera position: set z=1 so 'in front' placements have a sensible fallback
      let camPos = new THREE.Vector3(0, 0, 1);
      let forward = new THREE.Vector3(0, 0, -1);
      if (world.camera) {
        world.camera.getWorldPosition(camPos);
        world.camera.getWorldDirection(forward);
      }
      // Place Rhode Schwarz 1.7m in front of camera, feet on ground
      const distance = 1.7;
      const targetPos = camPos.clone().add(forward.multiplyScalar(distance));
      const baseY = -minY + 0.01;
      rhodeSchwarz.mesh.position.set(targetPos.x, baseY, targetPos.z);
      rhodeSchwarz.setGroundY(baseY);
      (world as any).rhodeSchwarzGroundY = baseY;

      // Face the user
      rhodeSchwarz.mesh.lookAt(camPos.x, rhodeSchwarz.mesh.position.y, camPos.z);
    } catch (err) {
      console.warn('Could not auto-scale/place Rhoda:', err);
    }

    rhodeSchwarzEntity.addComponent(OneHandGrabbable);
    rhodeSchwarzEntity.addComponent(Interactable);

    rhodeSchwarz.mesh.traverse((child: any) => {
      if (child.isMesh) {
        child.userData.interactable = true;
        child.userData.onSelect = () => {
          console.log('👆 Rhoda was selected via ray!');
          rhodeSchwarz.onTouched();
        };
        child.raycast = child.raycast || THREE.Mesh.prototype.raycast;
      }
    });

    // Store references on the world for other systems
    (world as any).rhodeSchwarzEntity = rhodeSchwarzEntity;
    (world as any).rhodeSchwarzMesh = rhodeSchwarz.mesh;
    (world as any).rhodeSchwarz = rhodeSchwarz;
  }

  class RhodeSchwarzSystem extends createSystem() {
    update(_delta: number, _time: number) {
      if (this.camera) rhodeSchwarz.update(this.camera);
    }
  }
  world.registerSystem(RhodeSchwarzSystem);

  world.registerSystem(PanelUISystem);
  world.registerSystem(HandRaySystem);
  world.registerSystem(DashboardSystem);

  const dashboardAnchor = new THREE.Group();
  const dashboardEntity = world.createTransformEntity(dashboardAnchor);
  // Make the dashboard slightly smaller and static (do not auto-follow)
  // to avoid constant distracting movement in the headset.
  dashboardEntity.addComponent(PanelUI, {
    config: "/ui/dashboard.json",
    // reduced size: more compact in the user's view
    maxWidth: 0.6,
    maxHeight: 0.45,
  });
  // Keep it interactable but do not add a Follower component so it stays put
  dashboardEntity.addComponent(Interactable);

  // Make dashboard meshes interactable
  dashboardAnchor.traverse((child: any) => {
    if (child.isMesh) {
      child.userData.interactable = true;
      child.userData.isDashboard = true;
      // Ensure mesh can be hit by raycaster
      child.raycast = child.raycast || THREE.Mesh.prototype.raycast;
    }
  });

  (world as any).dashboardAnchor = dashboardAnchor;
  // Ensure the dashboard anchor is attached to the scene root so it's not parented to
  // the camera or any transient object (prevents it from moving with the user).
  try {
    world.scene.add(dashboardAnchor);
  } catch (err) {
    console.warn('Could not add dashboardAnchor to scene root:', err);
  }

  const tmpPos = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();

  const placeDashboardInFront = () => {
    if (!world.camera) return;
    world.camera.getWorldPosition(tmpPos);
    world.camera.getWorldDirection(tmpDir);
    tmpDir.normalize().multiplyScalar(1.2);
    dashboardAnchor.position.copy(tmpPos).add(tmpDir);
    dashboardAnchor.position.y = tmpPos.y - 0.1;
    dashboardAnchor.lookAt(tmpPos.x, tmpPos.y - 0.1, tmpPos.z);
  };

  let dashboardVisible = true;
  let lastMenuToggle = 0;
  const toggleDashboard = (source: string) => {
    const now = performance.now();
    if (now - lastMenuToggle < 250) return;
    lastMenuToggle = now;
    dashboardVisible = !dashboardVisible;
    if (dashboardVisible) {
      // Place once in front of camera but do not keep moving it.
      placeDashboardInFront();
    }
    dashboardAnchor.visible = dashboardVisible;
    console.log(`🎛️ Dashboard ${dashboardVisible ? 'shown' : 'hidden'} via ${source}`);
  };

  // Place the dashboard once and keep it visible but static
  placeDashboardInFront();
  dashboardAnchor.visible = true;

  const menuEvents = ["menudown", "menupress", "menu", "menutoggle"];
  menuEvents.forEach((name) => {
    (world.input as any).addEventListener?.(name, (evt: any) => {
      console.log(`🎚️ Menu event detected: ${name}`, evt);
      toggleDashboard(name);
    });
  });

  window.addEventListener("keydown", (evt) => {
    if (evt.key === "m" || evt.key === "M") {
      toggleDashboard("keyboard");
    }
  });

  // Placement system: waits for detected planes and places Rhode Schwarz on the best floor/table plane
  class PlacementSystem extends createSystem({ planeEntities: { required: [XRPlane] } }) {
    private placed = false;

    update(_delta: number, _time: number) {
      if (this.placed) return;
      const planes = this.queries.planeEntities?.entities as Set<any> | undefined;
      if (!planes || planes.size === 0) return;

      const camPos = new THREE.Vector3();
      this.camera.getWorldPosition(camPos);
      // Use fixed desired height: 1.68m (5'6")
      const desiredHeight = 1.68;

      // Prefer the lowest plane that is noticeably below the camera (likely the floor).
      // This avoids choosing a shelf/table at head height.
      let best: any = null;
      let bestY = Infinity;
      for (const e of planes) {
        const obj = (e as any).object3D as THREE.Object3D | undefined;
        if (!obj) continue;
        const p = new THREE.Vector3();
        obj.getWorldPosition(p);
        // prefer planes at least 0.3m below the camera (so we avoid high shelves)
        if (p.y < camPos.y - 0.3 && p.y < bestY && p.distanceTo(camPos) < 5) {
          bestY = p.y;
          best = { entity: e, pos: p };
        }
      }

      // If we didn't find a plane sufficiently below the camera, fall back to the
      // lowest plane within range (this will pick the floor in most scenes).
      if (!best) {
        for (const e of planes) {
          const obj = (e as any).object3D as THREE.Object3D | undefined;
          if (!obj) continue;
          const p = new THREE.Vector3();
          obj.getWorldPosition(p);
          if (p.y < bestY && p.distanceTo(camPos) < 5) {
            bestY = p.y;
            best = { entity: e, pos: p };
          }
        }
      }
      if (!best) return;

      const rsMesh = (this.world as any).rhodeSchwarzMesh as THREE.Object3D | undefined;
      if (!rsMesh) return;

      try {
        const bbox = new THREE.Box3().setFromObject(rsMesh);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const modelHeight = size.y || 1;
        const scale = desiredHeight / modelHeight;
        (rsMesh as any).scale.setScalar(scale);

        const bbox2 = new THREE.Box3().setFromObject(rsMesh);
        const minY = bbox2.min.y;
        const epsilon = 0.01;
        // Place feet on detected plane with a tiny offset to avoid clipping
        const groundedY = best.pos.y - minY + epsilon;
        rsMesh.position.set(best.pos.x, groundedY, best.pos.z);

        // Face the user (rotate to look at camera)
        if (this.camera) {
          const camPos = new THREE.Vector3();
          this.camera.getWorldPosition(camPos);
          rsMesh.lookAt(camPos.x, rsMesh.position.y, camPos.z);
        }

        const rsAssistant = (this.world as any).rhodeSchwarz as RhodeSchwarzAssistant | undefined;
        rsAssistant?.setGroundY(groundedY);
        (this.world as any).rhodeSchwarzGroundY = groundedY;

        this.placed = true;
      } catch (err) {
        console.warn('Placement system error:', err);
      }
    }
  }
  world.registerSystem(PlacementSystem);

  // ===== INPUT EVENT DEBUGGING =====
  console.log('🎮 Wiring input events...');

  // Debug: Log all input events
  const originalAddEventListener = (world.input as any).addEventListener;
  (world.input as any).addEventListener = function (type: string, handler: any) {
    console.log(`[Input Event Registered] ${type}`);
    return originalAddEventListener?.call(this, type, handler);
  };

  // --- Pinch/Click to Speak (selectstart) ---
  const inputEventsToTrace = [
    "sourceschange",
    "selectstart",
    "select",
    "selectend",
    "squeezestart",
    "squeeze",
    "squeezeend",
    "inputsourceschange",
  ];
  inputEventsToTrace.forEach((type) => {
    (world.input as any).addEventListener?.(type, (evt: any) => {
      console.log(`📡 [INPUT] ${type}`, evt);
    });
  });

  (world.input as any).addEventListener?.("selectstart", (evt: any) => {
    console.log('🎯 [INPUT] selectstart event fired!', evt);

    if ((world as any).lastRhodeSchwarzIntersect) {
      console.log('👆 Interacting with Rhoda via ray!');
      rhodeSchwarz.onTouched();
      return; // Consume event
    }

    // Try to handle dashboard interaction
    if ((world as any).lastDashboardIntersect) {
      HandRaySystem.handleSelect(world);
      return; // Consume event if we hit the dashboard
    }

    const handedness = evt?.inputSource?.handedness || evt?.handedness;
    if (handedness === 'left') {
      toggleDashboard('left-select');
      return;
    }

    if (rhodeSchwarz.getState() === 'READY') {
      console.log('📢 Starting to listen...');
      void rhodeSchwarz.startListening();
    } else if (rhodeSchwarz.getState() === 'LISTENING') {
      console.log('🤐 Stopping listen...');
      void rhodeSchwarz.stopListening();
    }
  });

  (world.input as any).addEventListener?.("selectend", (evt: any) => {
    console.log('🎯 [INPUT] selectend event fired!', evt);
  });

  // --- Hand tracking events ---
  (world.input as any).addEventListener?.("handtracking", (evt: any) => {
    console.log('🖐️ [INPUT] hand tracking event:', evt);
  });

  // --- Touch/Grab detection on Rhoda entity ---
  const rsEntityRef = (world as any).rhodeSchwarzEntity;
  if (rsEntityRef) {
    console.log('🎯 Attaching grab listener to Rhoda entity...');
    (rsEntityRef as any).addEventListener?.('grab', (evt: any) => {
      console.log('✋ [GRAB] Rhoda was grabbed!', evt);
      rhodeSchwarz.onTouched();
    });
    (rsEntityRef as any).addEventListener?.('selectstart', (evt: any) => {
      console.log('✋ [SELECT] Rhoda was selected!', evt);
      rhodeSchwarz.onTouched();
    });
  } else {
    console.warn('⚠️ Rhoda entity not found for grab listener');
  }

  console.log("🔬 Rhoda Lab Assistant is ready in Mixed Reality!");
});