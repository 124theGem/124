import type { GameEvent } from '../core/types';
export class GameAudio {
  enabled = true;
  private context: AudioContext | null = null;
  private last = 0;
  unlock() {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    void this.context.resume();
  }
  play(event: GameEvent) {
    if (!this.enabled || !this.context || this.context.state !== 'running' || event.type !== 'cast')
      return;
    const now = this.context.currentTime;
    if (now - this.last < 0.06) return;
    this.last = now;
    const osc = this.context.createOscillator(),
      gain = this.context.createGain();
    osc.type = event.ultimate ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(event.ultimate ? 180 : 500, now);
    osc.frequency.exponentialRampToValueAtTime(event.ultimate ? 55 : 160, now + 0.15);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.start();
    osc.stop(now + 0.22);
  }
  dispose() {
    void this.context?.close();
  }
}
