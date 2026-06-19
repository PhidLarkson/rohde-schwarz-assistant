/**
 * AudioFeedback: Provides subtle sound effects for state changes and interactions.
 * Generates simple beeps/tones using Web Audio API.
 */
export class AudioFeedback {
  private audioContext: AudioContext | null = null;

  constructor() {
    // Lazy init to avoid autoplay restrictions
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  /**
   * Play a short beep at the specified frequency and duration.
   */
  private playTone(frequency: number, duration: number, volume: number = 0.3) {
    try {
      const ctx = this.ensureContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (err) {
      console.warn('Audio feedback error:', err);
    }
  }

  /** Listening started (gentle rising tone) */
  listening() {
    this.playTone(800, 0.1);
    setTimeout(() => this.playTone(1000, 0.1), 100);
  }

  /** Processing/thinking (medium beep) */
  processing() {
    this.playTone(600, 0.15);
  }

  /** Speaking started (confirmation beep) */
  speaking() {
    this.playTone(1200, 0.12);
  }

  /** Ready/complete (soft descending tone) */
  ready() {
    this.playTone(900, 0.1);
    setTimeout(() => this.playTone(700, 0.1), 80);
  }

  /** Button press (subtle click) */
  click() {
    this.playTone(1500, 0.05, 0.2);
  }

  /** Error (low warning tone) */
  error() {
    this.playTone(400, 0.2);
    setTimeout(() => this.playTone(350, 0.2), 150);
  }

  /** Success (pleasant chime) */
  success() {
    this.playTone(1000, 0.1);
    setTimeout(() => this.playTone(1200, 0.1), 100);
    setTimeout(() => this.playTone(1500, 0.15), 200);
  }
}
