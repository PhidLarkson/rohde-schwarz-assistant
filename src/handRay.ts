import { createSystem } from "@iwsdk/core";
import * as THREE from 'three';

/**
 * HandRaySystem — uses IWSDK's built-in xrManager to access XR frame,
 * session, and reference space. Renders pointer rays and performs
 * raycasting against dashboard and avatar meshes.
 *
 * IWSDK already renders its own RayPointer via MultiPointer, but we add
 * raycasting against our custom interactables (dashboard, Rhoda avatar)
 * and track which object is under the pointer for selectstart handling.
 */
export class HandRaySystem extends createSystem() {
  private raycaster = new THREE.Raycaster();
  private rayLength = 5;
  private tmpOrigin = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();
  private tmpQuat = new THREE.Quaternion();

  init() {
    this.raycaster.far = this.rayLength;
    console.log('🎯 HandRaySystem initialized (using IWSDK xrManager)');
  }

  update(_delta: number, _time: number) {
    // Use IWSDK's xrManager to get session, frame, reference space
    const xrManager = this.xrManager;
    if (!xrManager) return;

    const session = xrManager.getSession?.();
    if (!session || !session.inputSources) {
      (this.world as any).lastDashboardIntersect = null;
      (this.world as any).lastRhodeSchwarzIntersect = null;
      return;
    }

    const frame = xrManager.getFrame?.();
    const refSpace = xrManager.getReferenceSpace?.();
    if (!frame || !refSpace) return;

    let foundHit = false;

    for (const inputSource of session.inputSources) {
      if (inputSource.handedness !== 'left' && inputSource.handedness !== 'right') continue;

      // Prefer targetRaySpace for pointer direction
      const space = inputSource.targetRaySpace;
      if (!space) continue;

      let pose: XRPose | undefined;
      try {
        pose = frame.getPose(space, refSpace) ?? undefined;
      } catch {
        continue;
      }
      if (!pose) continue;

      const { position, orientation } = pose.transform;
      this.tmpOrigin.set(position.x, position.y, position.z);
      this.tmpQuat.set(orientation.x, orientation.y, orientation.z, orientation.w);
      this.tmpDir.set(0, 0, -1).applyQuaternion(this.tmpQuat).normalize();

      this.raycaster.set(this.tmpOrigin, this.tmpDir);

      // Collect interactables
      const targets: THREE.Object3D[] = [];
      const dashboardAnchor = (this.world as any).dashboardAnchor;
      if (dashboardAnchor && dashboardAnchor.visible) targets.push(dashboardAnchor);
      const rsMesh = (this.world as any).rhodeSchwarzMesh;
      if (rsMesh) targets.push(rsMesh);

      if (targets.length === 0) continue;

      const hits = this.raycaster.intersectObjects(targets, true);
      if (hits.length > 0) {
        const hit = hits[0];
        foundHit = true;

        if (hit.object.userData.isDashboard) {
          (this.world as any).lastDashboardIntersect = hit;
          (this.world as any).lastRhodeSchwarzIntersect = null;
        } else if (hit.object.userData.interactable) {
          (this.world as any).lastRhodeSchwarzIntersect = hit;
          (this.world as any).lastDashboardIntersect = null;
        }
      }
    }

    if (!foundHit) {
      (this.world as any).lastDashboardIntersect = null;
      (this.world as any).lastRhodeSchwarzIntersect = null;
    }
  }

  public static handleSelect(world: any) {
    const intersect = world.lastDashboardIntersect;
    if (!intersect || !intersect.uv) return;

    const x = intersect.uv.x;
    const y = 1 - intersect.uv.y;

    const buttonIds = [
      'btn-talk', 'btn-lang', 'btn-identify', 'btn-summon',
      'btn-follow', 'btn-reset', 'btn-allow', 'btn-deny',
    ];

    let root: Element | null = null;
    try {
      root = document.querySelector('.panel') || document.querySelector('[class*="panel"]') || document.body;
    } catch {
      root = document.body;
    }
    if (!root) return;

    const rootRect = root.getBoundingClientRect();
    const clickX = rootRect.left + x * rootRect.width;
    const clickY = rootRect.top + y * rootRect.height;

    for (const id of buttonIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clickX >= rect.left && clickX <= rect.right &&
          clickY >= rect.top && clickY <= rect.bottom) {
        el.click();
        return;
      }
    }
  }
}
