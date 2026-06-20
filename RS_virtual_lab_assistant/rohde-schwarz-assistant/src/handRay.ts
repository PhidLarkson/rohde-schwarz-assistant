import { createSystem } from "@iwsdk/core";
import * as THREE from 'three';

/**
 * HandRaySystem adds visual pointer rays from hands/controllers
 * to help users see what they're pointing at and enable UI selection.
 */
export class HandRaySystem extends createSystem() {
  private leftRay: THREE.Line | null = null;
  private rightRay: THREE.Line | null = null;
  private rayMaterial!: THREE.LineBasicMaterial;
  private raycaster = new THREE.Raycaster();
  private tempMatrix = new THREE.Matrix4();
  private rayLength = 3; // 3 meters

  init() {
    // Create material for the pointer rays (cyan color, semi-transparent)
    this.rayMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.6,
      linewidth: 2,
    });

    // Create ray lines
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
    // Access XR input sources
    const session = (this.world as any).xrSession;
    if (!session || !session.inputSources) {
      this.leftRay!.visible = false;
      this.rightRay!.visible = false;
      return;
    }

    let leftHandFound = false;
    let rightHandFound = false;

    // Iterate through input sources (hands/controllers)
    for (const inputSource of session.inputSources) {
      const handedness = inputSource.handedness;
      if (handedness !== 'left' && handedness !== 'right') continue;

      const ray = handedness === 'left' ? this.leftRay : this.rightRay;
      if (!ray) continue;

      // Get the grip space (hand/controller position)
      const gripSpace = inputSource.gripSpace;
      if (!gripSpace) continue;

      const frame = (this.world as any).xrFrame;
      const referenceSpace = (this.world as any).xrReferenceSpace;
      if (!frame || !referenceSpace) continue;

      try {
        const gripPose = frame.getPose(gripSpace, referenceSpace);
        if (!gripPose) continue;

        // Set ray position and orientation
        const transform = gripPose.transform;
        const position = transform.position;
        const orientation = transform.orientation;

        ray.position.set(position.x, position.y, position.z);
        ray.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
        ray.visible = true;

        if (handedness === 'left') leftHandFound = true;
        else rightHandFound = true;

        // Perform raycasting to detect UI/objects
        this.raycaster.set(
          new THREE.Vector3(position.x, position.y, position.z),
          new THREE.Vector3(0, 0, -1).applyQuaternion(ray.quaternion)
        );

        // Check intersection with all interactable objects
        const interactables: THREE.Object3D[] = [];

        // Dashboard
        const dashboardAnchor = (this.world as any).dashboardAnchor;
        if (dashboardAnchor && dashboardAnchor.visible) {
          interactables.push(dashboardAnchor);
        }

        // Rhode Schwarz character
        const rsMesh = (this.world as any).rhodeSchwarzMesh;
        if (rsMesh) {
          interactables.push(rsMesh);
        }

        if (interactables.length > 0) {
          const intersects = this.raycaster.intersectObjects(interactables, true);
          if (intersects.length > 0) {
            const hit = intersects[0];

            // Check if it's dashboard or character
            if (hit.object.userData.isDashboard) {
              // Dashboard hit
              this.rayMaterial.color.set(0x00ff00); // Green for dashboard
              (this.world as any).lastDashboardIntersect = hit;
              (this.world as any).lastRhodeSchwarzIntersect = null;
            } else if (hit.object.userData.interactable) {
              // Character hit
              this.rayMaterial.color.set(0xffff00); // Yellow for character
              (this.world as any).lastRhodeSchwarzIntersect = hit;
              (this.world as any).lastDashboardIntersect = null;
            }
          } else {
            this.rayMaterial.color.set(0x00ffff); // Cyan default
            (this.world as any).lastDashboardIntersect = null;
            (this.world as any).lastRhodeSchwarzIntersect = null;
          }
        }
      } catch (err) {
        console.warn('Hand ray update error:', err);
      }
    }

    // Hide rays for hands that aren't present
    if (!leftHandFound && this.leftRay) this.leftRay.visible = false;
    if (!rightHandFound && this.rightRay) this.rightRay.visible = false;
  }

  // Helper to simulate clicks on dashboard buttons based on UV coordinates
  public static handleSelect(world: any) {
    const intersect = (world as any).lastDashboardIntersect;
    if (!intersect || !intersect.uv) return;

    const uv = intersect.uv;
    // Invert Y because UV origin is bottom-left, DOM is top-left
    const x = uv.x;
    const y = 1 - uv.y;

    console.log(`🎯 Dashboard hit at UV: ${x.toFixed(2)}, ${y.toFixed(2)}`);

    // List of interactive elements to check (keep in sync with dashboard.uikitml)
    const buttonIds = ['btn-listen', 'btn-summon', 'btn-learn-phrase', 'btn-quiz', 'toggle-autofollow'];

    // Find the dashboard container (it's usually the first .panel-container or similar in the DOM)
    // Since we don't have direct access to the internal PanelUI DOM structure easily,
    // we'll try to find the elements by ID and check their relative positions.
    // Note: This assumes the elements are in the document (PanelUI usually keeps them there).

    // We need to find the root element of the dashboard to normalize coordinates
    // The dashboard.uikitml root typically has a glass-card wrapper
    // Cache root lookup but fall back gracefully
    let root: Element | null = null;
    try {
      root = document.querySelector('.glass-card') || document.querySelector('.panel-root') || document.body;
    } catch (err) {
      console.warn('Error querying dashboard root element', err);
      root = document.body;
    }
    if (!root) {
      console.warn('Dashboard root element (.glass-card) not found in DOM');
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const clickX = rootRect.left + x * rootRect.width;
    const clickY = rootRect.top + y * rootRect.height;

    // Check which button is under this position
    for (const id of buttonIds) {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        // Check if click point is within this element's rect
        if (clickX >= rect.left && clickX <= rect.right &&
          clickY >= rect.top && clickY <= rect.bottom) {

          console.log(`🖱️ Virtual click on #${id}`);
          el.click();

          // Visual feedback
          el.classList.add('active');
          setTimeout(() => el.classList.remove('active'), 200);
          return;
        }
      }
    }
    console.log('No button found at this position');
  }

  cleanup() {
    if (this.leftRay) this.scene.remove(this.leftRay);
    if (this.rightRay) this.scene.remove(this.rightRay);
  }
}
