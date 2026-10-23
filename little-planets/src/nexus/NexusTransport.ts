import {
  freshNexusProfile, spawnNexus, stepNexus, completeNexus, customizeNexus,
  type NexusSnapshot, type NexusProfile, type NexusCommand, type NexusInput, type NexusActor,
} from "../../shared/nexus";

export class NexusTransport {
  private profile?: NexusProfile;
  private actor?: NexusActor;
  private session = "local-session";
  constructor(readonly local: boolean, private initData: string, private name: string) {}
  private async request(body: unknown): Promise<NexusSnapshot> {
    const response = await fetch(new URL("./api/nexus", location.href), {
      method: "POST", headers: { Authorization: `tma ${this.initData}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || "Хаб временно недоступен.");
      Object.assign(error, { status: response.status }); throw error;
    }
    return data;
  }
  private snapshot(): NexusSnapshot {
    return { session: this.session, self: { ...this.actor! }, profile: structuredClone(this.profile!),
      serverTime: Date.now(), peers: [], online: 1,
      leaderboard: this.profile!.bestRace === null ? [] : [{ name: this.profile!.name, bestRace: this.profile!.bestRace! }] };
  }
  private save() { localStorage.setItem("little-planets-nexus-v1", JSON.stringify(this.profile)); }
  async join() {
    if (!this.local) { const snapshot = await this.request({ type: "join" }); this.session = snapshot.session; return snapshot; }
    const raw = localStorage.getItem("little-planets-nexus-v1");
    this.profile = raw ? JSON.parse(raw) : freshNexusProfile(this.name);
    this.actor = spawnNexus(this.profile!, "local-pilot", "hub", Date.now());
    this.save(); return this.snapshot();
  }
  async input(frames: NexusInput[]) {
    if (!this.local) return this.request({ type: "input", session: this.session, frames });
    const wasFinished = this.actor!.finishedAt;
    for (const frame of frames) if (frame.seq > this.actor!.seq) stepNexus(this.actor!, frame, Date.now());
    if (wasFinished === null && this.actor!.finishedAt !== null) { completeNexus(this.profile!, this.actor!); this.save(); }
    return this.snapshot();
  }
  async command(command: NexusCommand) {
    if (!this.local) return this.request({ type: "command", session: this.session, command });
    if (command.type === "enter" || command.type === "restart") this.actor = spawnNexus(this.profile!, this.actor!.id, command.type === "enter" ? command.world : this.actor!.world, Date.now());
    if (command.type === "customize") {
      customizeNexus(this.profile!, command); this.save();
      Object.assign(this.actor!, { name: this.profile!.name, color: this.profile!.color, outfit: this.profile!.outfit });
    }
    if (command.type === "emote") { this.actor!.emote = command.emote; this.actor!.emoteAt = Date.now(); }
    return this.snapshot();
  }
  leave() {
    if (!this.local) void fetch(new URL("./api/nexus", location.href), {
      method: "POST", headers: { Authorization: `tma ${this.initData}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "leave", session: this.session }), keepalive: true,
    }).catch(() => {});
  }
}
