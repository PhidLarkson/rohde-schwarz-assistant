import {
  PanelDocument,
  PanelUI,
  UIKitDocument,
  createSystem,
  eq,
} from "@iwsdk/core";
import type { RhodeSchwarzAssistant, RhodeSchwarzState } from "./rhode_schwarz";

export class DashboardSystem extends createSystem({
  dashboard: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "/ui/dashboard.json")],
  },
}) {
  private document: UIKitDocument | null = null;
  private autoFollowEnabled: boolean = false;
  private lastStatusSnapshot: string = '';

  init() {
    this.queries.dashboard.subscribe("qualify", (entity) => {
      const document = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      if (!document) return;
      this.document = document;
      this.attachEventHandlers(document);
      this.refreshStatus();
    });
    this.queries.dashboard.subscribe("disqualify", () => {
      this.document = null;
    });
  }

  update(_delta: number, _time: number) {
    this.refreshStatus();
  }

  private attachEventHandlers(document: UIKitDocument) {
    const summonButton = document.getElementById("btn-summon") as any;
    const followButton = document.getElementById("btn-follow") as any;
    const talkButton = document.getElementById("btn-talk") as any;
    const talkLabel = document.getElementById("btn-talk-label") as any;
    const resetButton = document.getElementById("btn-reset") as any;

    summonButton?.addEventListener("click", () => {
      const rs = this.getRhoda();
      if (!rs || !this.world.camera) return;
      console.log('📍 Dashboard: Summon Rhoda');
      rs.summon(this.world.camera, rs.getGroundY());
    });

    followButton?.addEventListener("click", () => {
      const rs = this.getRhoda();
      if (!rs) return;
      const newState = rs.toggleAutoFollow();
      this.autoFollowEnabled = newState;
      console.log(`🚶 Dashboard: Auto-Follow ${newState ? 'ON' : 'OFF'}`);
      followButton?.setProperties?.({
        text: 'Autofollow',
        class: newState ? 'btn accent' : 'btn'
      });
    });

    talkButton?.addEventListener("click", () => {
      const rs = this.getRhoda();
      if (!rs) return;
      const newMuted = !rs.isMuted();
      rs.setMuted(newMuted);
      console.log(`🔇 Dashboard: Mute toggled -> ${newMuted ? 'MUTED' : 'UNMUTED'}`);
      talkLabel?.setProperties?.({ text: newMuted ? 'Unmute' : 'Mute' });
      talkButton?.setProperties?.({ class: newMuted ? 'btn danger' : 'btn primary' });
    });

    resetButton?.addEventListener("click", () => {
      const rs = this.getRhoda();
      if (!rs) return;
      rs.resetConversation();
      console.log('🔄 Dashboard: Session reset');
    });
  }

  private refreshStatus() {
    if (!this.document) return;
    const rs = this.getRhoda();

    const modeNode = this.document.getElementById("status-mode") as any;
    const talkButton = this.document.getElementById("btn-talk") as any;
    const talkLabel = this.document.getElementById("btn-talk-label") as any;
    const followButton = this.document.getElementById("btn-follow") as any;

    if (rs) {
      const realState = rs.getState();
      const stageLabel = typeof rs.getStatusLabel === 'function' ? rs.getStatusLabel() : undefined;
      const statusText = stageLabel || realState || 'READY';

      const isMuted = rs.isMuted ? rs.isMuted() : false;
      const talkText = isMuted ? 'Unmute' : 'Mute';
      const talkClass = isMuted ? 'btn danger' : 'btn primary';

      this.logStatus(realState as any, statusText);
      modeNode?.setProperties?.({ text: statusText });
      talkLabel?.setProperties?.({ text: talkText });
      talkButton?.setProperties?.({ class: talkClass, disabled: false });

      const followState = typeof rs.isAutoFollowEnabled === 'function' ? rs.isAutoFollowEnabled() : this.autoFollowEnabled;
      this.autoFollowEnabled = followState;
      followButton?.setProperties?.({
        text: 'Autofollow',
        class: followState ? 'btn accent' : 'btn'
      });
    } else {
      modeNode?.setProperties?.({ text: "OFFLINE" });
    }
  }

  private getRhoda(): RhodeSchwarzAssistant | undefined {
    return (this.world as any).rhodeSchwarz as RhodeSchwarzAssistant | undefined;
  }

  private logStatus(state: RhodeSchwarzState, text: string) {
    const snapshot = `${state}|${text}`;
    if (this.lastStatusSnapshot === snapshot) return;
    this.lastStatusSnapshot = snapshot;
    console.log(`📺 Dashboard status → [${state}] ${text}`);
  }
}
