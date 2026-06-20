import {
  PanelDocument,
  PanelUI,
  UIKitDocument,
  createSystem,
  eq,
} from "@iwsdk/core";
import type { RhodeSchwarzAssistant, RhodeSchwarzState } from "./rhode_schwarz";
import { captureFrame, identifyComponent } from "./vision";
import { confirmPending, denyPending, getPendingConfirmation } from "./instrument";
import { geminiTTS } from "./genai";

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
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      if (!doc) return;
      this.document = doc;
      this.wire(doc);
      this.refreshStatus();
    });
    this.queries.dashboard.subscribe("disqualify", () => { this.document = null; });
  }

  update(_delta: number, _time: number) { this.refreshStatus(); }

  private wire(doc: UIKitDocument) {
    const el = (id: string) => doc.getElementById(id) as any;

    el("btn-talk")?.addEventListener("click", () => {
      const rs = this.getRhoda();
      if (!rs) return;
      const newMuted = !rs.isMuted();
      rs.setMuted(newMuted);
      el("btn-talk")?.setProperties?.({
        text: newMuted ? 'Start Mic' : 'Stop Mic',
        class: newMuted ? 'btn-mic-off' : 'btn-mic-on',
      });
    });

    el("btn-lang")?.addEventListener("click", () => {
      const rs = this.getRhoda();
      if (!rs) return;
      const next = rs.getLanguage() === 'en' ? 'tw' : 'en';
      rs.setLanguage(next);
      el("btn-lang")?.setProperties?.({
        text: next === 'en' ? 'Switch to Twi' : 'Switch to English',
        class: next === 'tw' ? 'btn-on' : 'btn',
      });
    });

    el("btn-identify")?.addEventListener("click", () => this.handleIdentify());

    el("btn-summon")?.addEventListener("click", () => {
      const rs = this.getRhoda();
      if (rs && this.world.camera) rs.summon(this.world.camera, rs.getGroundY());
    });

    el("btn-follow")?.addEventListener("click", () => {
      const rs = this.getRhoda();
      if (!rs) return;
      const on = rs.toggleAutoFollow();
      this.autoFollowEnabled = on;
      el("btn-follow")?.setProperties?.({ class: on ? 'btn-on' : 'btn' });
    });

    el("btn-reset")?.addEventListener("click", () => {
      const rs = this.getRhoda();
      if (rs) rs.resetConversation();
    });

    el("btn-allow")?.addEventListener("click", () => {
      if (!getPendingConfirmation()) return;
      confirmPending();
      this.hideConfirmButtons();
      this.setStatus('Confirmed');
      setTimeout(() => this.setStatus('Ready'), 2000);
    });

    el("btn-deny")?.addEventListener("click", () => {
      if (!getPendingConfirmation()) return;
      denyPending();
      this.hideConfirmButtons();
      this.setStatus('Cancelled');
      setTimeout(() => this.setStatus('Ready'), 2000);
    });
  }

  private async handleIdentify() {
    const rs = this.getRhoda();
    this.setStatus('Capturing...');

    try {
      const frame = await captureFrame();
      if (!frame) {
        this.setStatus('No camera');
        setTimeout(() => this.setStatus('Ready'), 3000);
        return;
      }

      this.setStatus('Analyzing...');
      const result = await identifyComponent(frame);
      this.setStatus(result.label);

      const speech = `${result.description || result.label}${result.safety_note ? '. ' + result.safety_note : ''}`;
      if (rs) {
        try {
          rs.setState('SPEAKING');
          rs.setStatusLabel('Speaking...');
          const audio = await geminiTTS(speech);
          // playAudioBlob starts talking animation + lip sync, returns to idle on end
          await rs.playAudioBlob(audio);
        } catch (_) {
          const u = new SpeechSynthesisUtterance(speech);
          u.lang = 'en-US';
          speechSynthesis.speak(u);
        }
        rs.setState('READY');
        rs.setStatusLabel('Ready');
      }

      setTimeout(() => this.setStatus('Ready'), 6000);
    } catch {
      this.setStatus('Failed');
      setTimeout(() => this.setStatus('Ready'), 3000);
    }
  }

  private setStatus(text: string) {
    const node = this.document?.getElementById("status-mode") as any;
    node?.setProperties?.({ text });
  }

  private showConfirmButtons() {
    if (!this.document) return;
    (this.document.getElementById("btn-allow") as any)?.setProperties?.({ class: 'btn-yes' });
    (this.document.getElementById("btn-deny") as any)?.setProperties?.({ class: 'btn-no' });
  }

  private hideConfirmButtons() {
    if (!this.document) return;
    (this.document.getElementById("btn-allow") as any)?.setProperties?.({ class: 'btn-hidden' });
    (this.document.getElementById("btn-deny") as any)?.setProperties?.({ class: 'btn-hidden' });
  }

  private refreshStatus() {
    if (!this.document) return;
    const rs = this.getRhoda();
    const talkBtn = this.document.getElementById("btn-talk") as any;
    const followBtn = this.document.getElementById("btn-follow") as any;

    if (rs) {
      const state = rs.getState();
      const label = typeof rs.getStatusLabel === 'function' ? rs.getStatusLabel() : undefined;
      const text = label || state || 'Ready';
      const muted = rs.isMuted ? rs.isMuted() : true;

      this.logStatus(state as any, text);
      this.setStatus(text);
      talkBtn?.setProperties?.({
        text: muted ? 'Start Mic' : 'Stop Mic',
        class: muted ? 'btn-mic-off' : 'btn-mic-on',
      });

      const following = typeof rs.isAutoFollowEnabled === 'function'
        ? rs.isAutoFollowEnabled() : this.autoFollowEnabled;
      this.autoFollowEnabled = following;
      followBtn?.setProperties?.({ class: following ? 'btn-on' : 'btn' });

      if (getPendingConfirmation()) this.showConfirmButtons();
    } else {
      this.setStatus('Offline');
    }
  }

  private getRhoda(): RhodeSchwarzAssistant | undefined {
    return (this.world as any).rhodeSchwarz as RhodeSchwarzAssistant | undefined;
  }

  private logStatus(state: RhodeSchwarzState, text: string) {
    const s = `${state}|${text}`;
    if (this.lastStatusSnapshot === s) return;
    this.lastStatusSnapshot = s;
  }
}
