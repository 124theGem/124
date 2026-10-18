type Sound =
  | "step"
  | "plant"
  | "gather"
  | "craft"
  | "build"
  | "attack"
  | "hit"
  | "hurt"
  | "kill"
  | "launch"
  | "land"
  | "thunder"
  | "click";
export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private effectGain?: GainNode;
  private ambience?: {
    node: AudioBufferSourceNode;
    gain: GainNode;
    filter: BiquadFilterNode;
  };
  private delay?: DelayNode;
  private timer = 0;
  private nextNote = 0;
  private beat = 0;
  private notes = 0;
  private played = 0;
  private abort = new AbortController();
  music = true;
  effects = true;
  volume = 0.45;
  muted = false;
  constructor() {
    try {
      const saved = JSON.parse(
        localStorage.getItem("little-planets-audio") || "{}",
      );
      if (typeof saved.music === "boolean") this.music = saved.music;
      if (typeof saved.effects === "boolean") this.effects = saved.effects;
      if (typeof saved.volume === "number") this.volume = saved.volume;
      if (typeof saved.muted === "boolean") this.muted = saved.muted;
    } catch {}
    this.music = !!this.music;
    this.effects = !!this.effects;
    this.volume = Math.max(0, Math.min(1, Number(this.volume) || 0));
    window.addEventListener("pointerdown", this.unlock, {
      signal: this.abort.signal,
    });
    window.addEventListener("keydown", this.unlock, {
      signal: this.abort.signal,
    });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) void this.context?.suspend();
        else if (this.context && this.context.state === "suspended")
          void this.context.resume();
      },
      { signal: this.abort.signal },
    );
  }
  unlock = () => {
    if (!this.context) {
      try {
        const c = (this.context = new AudioContext());
        this.master = c.createGain();
        this.master.connect(c.destination);
        this.musicGain = c.createGain();
        this.musicGain.gain.value = 0.25;
        this.musicGain.connect(this.master);
        this.effectGain = c.createGain();
        this.effectGain.connect(this.master);
        this.delay = c.createDelay(0.8);
        this.delay.delayTime.value = 0.29;
        const echo = c.createGain();
        echo.gain.value = 0.18;
        this.delay.connect(echo);
        echo.connect(this.musicGain);
        this.nextNote = c.currentTime + 0.05;
        this.timer = window.setInterval(() => this.schedule(), 100);
        this.makeAmbience();
      } catch {
        return;
      }
    }
    void this.context.resume();
    this.apply();
  };
  private apply() {
    const c = this.context;
    if (!c || !this.master) return;
    this.master.gain.setTargetAtTime(
      this.muted ? 0 : this.volume,
      c.currentTime,
      0.08,
    );
    this.musicGain!.gain.setTargetAtTime(
      this.music ? 0.25 : 0,
      c.currentTime,
      0.1,
    );
    this.effectGain!.gain.setTargetAtTime(
      this.effects ? 1 : 0,
      c.currentTime,
      0.08,
    );
  }
  set(key: "music" | "effects" | "volume", value: boolean | number) {
    if (key === "volume") this.volume = Math.max(0, Math.min(1, Number(value)));
    else this[key] = !!value;
    this.apply();
    this.persist();
  }
  toggleMute() {
    this.muted = !this.muted;
    this.apply();
    this.persist();
  }
  private persist() {
    try {
      localStorage.setItem(
        "little-planets-audio",
        JSON.stringify({
          music: this.music,
          effects: this.effects,
          volume: this.volume,
          muted: this.muted,
        }),
      );
    } catch {}
  }
  private tone(
    frequency: number,
    time: number,
    duration: number,
    gain: number,
    type: OscillatorType = "sine",
    music = false,
    endFrequency?: number,
  ) {
    const c = this.context;
    if (!c) return;
    const oscillator = c.createOscillator(),
      envelope = c.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    if (endFrequency)
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFrequency),
        time + duration,
      );
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, gain),
      time + 0.015,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope);
    envelope.connect(music ? this.musicGain! : this.effectGain!);
    if (music && this.delay) envelope.connect(this.delay);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.03);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }
  private schedule() {
    const c = this.context;
    if (!c || c.state !== "running") return;
    if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + 0.03;
    while (this.nextNote < c.currentTime + 0.3) {
      const t = this.nextNote,
        bar = Math.floor(this.beat / 16) % 4,
        root = [48, 53, 45, 55][bar],
        melody = [0, 7, 12, 16, 14, 12, 7, 4, 0, 7, 12, 19, 16, 14, 12, 7][
          this.beat % 16
        ];
      if (this.music && !this.muted) {
        this.tone(
          440 * 2 ** ((root + 12 + melody - 69) / 12),
          t,
          1.15,
          0.1,
          "sine",
          true,
        );
        if (this.beat % 4 === 0)
          this.tone(
            440 * 2 ** ((root - 69) / 12),
            t,
            1.5,
            0.14,
            "triangle",
            true,
          );
        if (this.beat % 16 === 0)
          for (const interval of [0, 4, 7])
            this.tone(
              440 * 2 ** ((root + interval + 12 - 69) / 12),
              t,
              5.8,
              0.035,
              "sine",
              true,
            );
        this.notes++;
      }
      this.beat++;
      this.nextNote += 0.37;
    }
  }
  private noise(duration: number, gain: number, lowpass = 1000) {
    const c = this.context;
    if (!c) return;
    const source = c.createBufferSource(),
      buffer = c.createBuffer(
        1,
        Math.ceil(c.sampleRate * duration),
        c.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 1.6;
    source.buffer = buffer;
    const filter = c.createBiquadFilter(),
      envelope = c.createGain();
    filter.type = "lowpass";
    filter.frequency.value = lowpass;
    envelope.gain.value = gain;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.effectGain!);
    source.start();
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }
  play(sound: Sound) {
    const c = this.context;
    if (!c || c.state !== "running" || !this.effects || this.muted) return;
    this.played++;
    const t = c.currentTime;
    switch (sound) {
      case "step":
        this.noise(0.055, 0.035, 650);
        break;
      case "plant":
        this.tone(360, t, 0.2, 0.12, "sine", false, 680);
        break;
      case "gather":
      case "kill":
        for (let i = 0; i < 3; i++)
          this.tone([523, 659, 784][i], t + i * 0.07, 0.4, 0.11);
        break;
      case "craft":
      case "build":
        this.noise(0.14, 0.12, 1600);
        for (let i = 0; i < 3; i++)
          this.tone(330 + i * 165, t + 0.09 + i * 0.08, 0.45, 0.1, "triangle");
        break;
      case "attack":
        this.tone(540, t, 0.18, 0.14, "sawtooth", false, 110);
        this.noise(0.1, 0.08, 2400);
        break;
      case "hit":
        this.noise(0.14, 0.18, 1100);
        this.tone(160, t, 0.12, 0.14, "triangle", false, 70);
        break;
      case "hurt":
        this.noise(0.19, 0.13, 800);
        this.tone(230, t, 0.24, 0.15, "sawtooth", false, 90);
        break;
      case "launch":
        this.noise(1.8, 0.3, 1200);
        this.tone(45, t, 1.5, 0.18, "sawtooth", false, 140);
        break;
      case "land":
        this.noise(0.7, 0.2, 700);
        break;
      case "thunder":
        this.noise(2.3, 0.35, 550);
        this.tone(40, t, 1.3, 0.1, "sine");
        break;
      case "click":
        this.tone(700, t, 0.06, 0.04);
    }
  }
  private makeAmbience() {
    const c = this.context!;
    const source = c.createBufferSource(),
      buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * 0.6;
    source.buffer = buffer;
    source.loop = true;
    const filter = c.createBiquadFilter(),
      gain = c.createGain();
    filter.type = "lowpass";
    filter.frequency.value = 650;
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effectGain!);
    source.start();
    this.ambience = { node: source, gain, filter };
  }
  weather(type?: string) {
    const c = this.context;
    if (!c || !this.ambience) return;
    const rain = type === "rain" || type === "storm",
      wind = type === "hurricane" || type === "wind";
    this.ambience.gain.gain.setTargetAtTime(
      rain ? 0.075 : wind ? 0.055 : 0,
      c.currentTime,
      0.8,
    );
    this.ambience.filter.frequency.setTargetAtTime(
      rain ? 2400 : 500,
      c.currentTime,
      0.5,
    );
  }
  get stats() {
    return {
      music: this.music,
      effects: this.effects,
      volume: this.volume,
      muted: this.muted,
      state: this.context?.state ?? "locked",
      notes: this.notes,
      effectsPlayed: this.played,
    };
  }
  dispose() {
    this.abort.abort();
    clearInterval(this.timer);
    void this.context?.close();
  }
}
