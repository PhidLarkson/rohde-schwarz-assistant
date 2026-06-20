import { createSystem } from "@iwsdk/core";
import * as THREE from 'three';

/**
 * HandRaySystem adds visual pointer rays from hands/controllers
 * to help users see what they're pointing at and enable UI selection.
 */
export class HandRaySystem extends createSystem() {
  private leftRay: THREE.Mesh | null = null;
  private rightRay: THREE.Mesh | null = null;
  private leftMaterial!: THREE.MeshBasicMaterial;
  private rightMaterial!: THREE.MeshBasicMaterial;
  private raycaster = new THREE.Raycaster();
  private rayLength = 3;
  private hitDot: THREE.Mesh | null = null;

  init() {
    const makeRayMesh = () => {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.5,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      const geo = new THREE.CylinderGeometry(0.002, 0.0005, this.rayLength, 6, 1, true);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0, -this.rayLength / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 999;
      mesh.frustumCulled = false;
      mesh.visible = false;
      return { mesh, mat };
    };

    const left = makeRayMesh();
    const right = makeRayMesh();
    this.leftRay = left.mesh;
    this.rightRay = right.mesh;
    this.leftMaterial = left.mat;
    this.rightMaterial = right.mat;

    const dotGeo = new THREE.SphereGeometry(0.008, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false });
    this.hitDot = new THREE.Mesh(dotGeo, dotMat);
    this.hitDot.visible = false;
    this.hitDot.renderOrder = 1000;
    this.scene.add(this.hitDot);

    this.scene.add(this.leftRay);
    this.scene.add(this.rightRay);

    console.log('🎯 Hand ray system initialized');
  }

  update(_delta: number, _time: number) {
    const session = (this.world as any).xrSession;
    if (!session || !session.inputSources) {
      if (this.leftRay) this.leftRay.visible = false;
      if (this.rightRay) this.rightRay.visible = false;
      if (this.hitDot) this.hitDot.visible = false;
      return;
    }

    let leftHandFound = false;
    let rightHandFound = false;
    let anyHit = false;

    for (const inputSource of session.inputSources) {
      const handedness = inputSource.handedness;
      if (handedness !== 'left' && handedness !== 'right') continue;

      const ray = handedness === 'left' ? this.leftRay : this.rightRay;
      const mat = handedness === 'left' ? this.leftMaterial : this.rightMaterial;
      if (!ray || !mat) continue;

      // Prefer targetRaySpace (pointer direction) over gripSpace
      const space = inputSource.targetRaySpace || inputSource.gripSpace;
      if (!space) continue;

      const frame = (this.world as any).xrFrame;
      const referenceSpace = (this.world as any).xrReferenceSpace;
      if (!frame || !referenceSpace) continue;

      try {
        const pose = frame.getPose(space, referenceSpace);
        if (!pose) continue;

        const { position, orientation } = pose.transform;

        ray.position.set(position.x, position.y, position.z);
        ray.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
        ray.visible = true;

        if (handedness === 'left') leftHandFound = true;
        else rightHandFound = true;

        const origin = new THREE.Vector3(position.x, position.y, position.z);
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(ray.quaternion).normalize();
        this.raycaster.set(origin, direction);
        this.raycaster.far = this.rayLength;

        const interactables: THREE.Object3D[] = [];

        const dashboardAnchor = (this.world as any).dashboardAnchor;
        if (dashboardAnchor && dashboardAnchor.visible) {
          interactables.push(dashboardAnchor);
        }

        const rsMesh = (this.world as any).rhodeSchwarzMesh;
        if (rsMesh) interactables.push(rsMesh);

        if (interactables.length > 0) {
          const intersects = this.raycaster.intersectObjects(interactables, true);
          if (intersects.length > 0) {
            const hit = intersects[0];
            anyHit = true;

            if (this.hitDot) {
              this.hitDot.position.copy(hit.point);
              this.hitDot.visible = true;
            }

            if (hit.object.userData.isDashboard) {
              mat.color.set(0x00ff00);
              mat.opacity = 0.8;
              (this.world as any).lastDashboardIntersect = hit;
              (this.world as any).lastRhodeSchwarzIntersect = null;
            } else if (hit.object.userData.interactable) {
              mat.color.set(0xffff00);
              mat.opacity = 0.8;
              (this.world as any).lastRhodeSchwarzIntersect = hit;
              (this.world as any).lastDashboardIntersect = null;
            }
          } else {
            mat.color.set(0x00ffff);
            mat.opacity = 0.5;
            (this.world as any).lastDashboardIntersect = null;
            (this.world as any).lastRhodeSchwarzIntersect = null;
          }
        }
      } catch (err) {
        // silently skip frame errors
      }
    }

    if (!leftHandFound && this.leftRay) this.leftRay.visible = false;
    if (!rightHandFound && this.rightRay) this.rightRay.visible = false;
    if (!anyHit && this.hitDot) this.hitDot.visible = false;
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
      root = document.querySelector('.panel') || document.querySelector('[class*="panel"]') || document.body;
    } catch (_) {
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
