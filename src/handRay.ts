import { createSystem } from "@iwsdk/core";
import * as THREE from 'three';

/**
 * HandRaySystem — ported directly from the working khaya-xr implementation.
 * Renders pointer rays from controllers/hands and raycasts against
 * dashboard and avatar meshes.
 */
export class HandRaySystem extends createSystem() {
  private leftRay: THREE.Line | null = null;
  private rightRay: THREE.Line | null = null;
  private rayMaterial!: THREE.LineBasicMaterial;
  private raycaster = new THREE.Raycaster();
  private tempMatrix = new THREE.Matrix4();
  private rayLength = 3;

  init() {
    this.rayMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.6,
      linewidth: 2,
    });

    const rayGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -this.rayLength),
    ]);

    this.leftRay = new THREE.Line(rayGeometry, this.rayMaterial);
    this.rightRay = new THREE.Line(rayGeometry.clone(), this.rayMaterial);

    this.leftRay.visible = false;
    this.rightRay.visible = false;

    this.scene.add(this.leftRay);
    this.scene.add(this.rightRay);

    console.log('🎯 Hand ray system initialized');
  }

  update(_delta: number, _time: number) {
    const session = (this.world as any).xrSession;
    if (!session || !session.inputSources) {
      if (this.leftRay) this.leftRay.visible = false;
      if (this.rightRay) this.rightRay.visible = false;
      return;
    }

    let leftHandFound = false;
    let rightHandFound = false;

    for (const inputSource of session.inputSources) {
      const handedness = inputSource.handedness;
      if (handedness !== 'left' && handedness !== 'right') continue;

      const ray = handedness === 'left' ? this.leftRay : this.rightRay;
      if (!ray) continue;

      const gripSpace = inputSource.gripSpace;
      if (!gripSpace) continue;

      const frame = (this.world as any).xrFrame;
      const referenceSpace = (this.world as any).xrReferenceSpace;
      if (!frame || !referenceSpace) continue;

      try {
        const gripPose = frame.getPose(gripSpace, referenceSpace);
        if (!gripPose) continue;

        const transform = gripPose.transform;
        const position = transform.position;
        const orientation = transform.orientation;

        ray.position.set(position.x, position.y, position.z);
        ray.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
        ray.visible = true;

        if (handedness === 'left') leftHandFound = true;
        else rightHandFound = true;

        this.raycaster.set(
          new THREE.Vector3(position.x, position.y, position.z),
          new THREE.Vector3(0, 0, -1).applyQuaternion(ray.quaternion)
        );

        const interactables: THREE.Object3D[] = [];

        const dashboardAnchor = (this.world as any).dashboardAnchor;
        if (dashboardAnchor && dashboardAnchor.visible) {
          interactables.push(dashboardAnchor);
        }

        const rsMesh = (this.world as any).rhodeSchwarzMesh;
        if (rsMesh) {
          interactables.push(rsMesh);
        }

        if (interactables.length > 0) {
          const intersects = this.raycaster.intersectObjects(interactables, true);
          if (intersects.length > 0) {
            const hit = intersects[0];

            if (hit.object.userData.isDashboard) {
              this.rayMaterial.color.set(0x00ff00);
              (this.world as any).lastDashboardIntersect = hit;
              (this.world as any).lastRhodeSchwarzIntersect = null;
            } else if (hit.object.userData.interactable) {
              this.rayMaterial.color.set(0xffff00);
              (this.world as any).lastRhodeSchwarzIntersect = hit;
              (this.world as any).lastDashboardIntersect = null;
            }
          } else {
            this.rayMaterial.color.set(0x00ffff);
            (this.world as any).lastDashboardIntersect = null;
            (this.world as any).lastRhodeSchwarzIntersect = null;
          }
        }
      } catch (err) {
        console.warn('Hand ray update error:', err);
      }
    }

    if (!leftHandFound && this.leftRay) this.leftRay.visible = false;
    if (!rightHandFound && this.rightRay) this.rightRay.visible = false;
  }

  public static handleSelect(world: any) {
    const intersect = (world as any).lastDashboardIntersect;
    if (!intersect || !intersect.uv) return;

    const uv = intersect.uv;
    const x = uv.x;
    const y = 1 - uv.y;

    console.log(`🎯 Dashboard hit at UV: ${x.toFixed(2)}, ${y.toFixed(2)}`);

    const buttonIds = [
      'btn-talk', 'btn-lang', 'btn-identify', 'btn-summon',
      'btn-follow', 'btn-reset', 'btn-allow', 'btn-deny',
    ];

    let root: Element | null = null;
    try {
      root = document.querySelector('.panel') || document.querySelector('.glass-card') || document.querySelector('[class*="panel"]') || document.body;
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
        console.log(`🖱️ Virtual click on #${id}`);
        el.click();
        return;
      }
    }
  }

  cleanup() {
    if (this.leftRay) this.scene.remove(this.leftRay);
    if (this.rightRay) this.scene.remove(this.rightRay);
  }
}
