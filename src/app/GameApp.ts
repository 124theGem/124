import { CLASSES, getClass } from '../game/classes/catalog';
import { FIXED_DT, type GameEvent, type MatchState, type Mode } from '../game/core/types';
import { distance } from '../game/core/math';
import { Simulation } from '../game/simulation/Simulation';
import { BotController } from '../game/ai/BotController';
import { HumanController } from '../game/controls/HumanController';
import { bindControls } from '../game/controls/bindings';
import { WorldRenderer } from '../game/rendering/WorldRenderer';
import { GameAudio } from '../game/rendering/audio';
import { HeroPreview } from '../game/rendering/HeroPreview';
import { debugAction, debugTick, isInvulnerable } from './DevTools';
import {
  LocalProfileStore,
  equipmentStats,
  equip,
  rewardMatch,
  type Profile,
  type Reward,
} from '../game/storage/profile';
import { connectTelegram, type TelegramIntegration } from '../telegram/integration';
import {
  home,
  heroes,
  hud,
  inventory,
  results,
  settings,
  guide,
  header,
  MODES,
} from '../ui/templates';
import { escapeHtml, icon } from '../ui/icons';
interface FloatText {
  node: HTMLElement;
  position: { x: number; z: number };
  age: number;
}
type Screen = 'home' | 'heroes' | 'inventory' | 'battle' | 'demo';
export class GameApp {
  simulation: Simulation;
  renderer: WorldRenderer;
  profile: Profile;
  screen: Screen = 'home';
  paused = false;
  private store = new LocalProfileStore();
  private human = new HumanController();
  private bots = new Map<string, BotController>();
  private audio = new GameAudio();
  private telegram?: TelegramIntegration;
  private mode: Mode = 'raid';
  private allies: [string, string] = ['guardian', 'priest'];
  private classSelection = 'guardian';
  private allySlot: number | null = null;
  private itemSelection: string | null = null;
  private preview?: HeroPreview;
  private controlsCleanup?: () => void;
  private accumulator = 0;
  private last = 0;
  private uiTime = 0;
  private reward: Reward | null = null;
  private floatTexts: FloatText[] = [];
  private labels = new Map<string, HTMLElement>();
  private demoUntil = 0;
  private debugVisible = false;
  private showAi = false;
  private showNav = false;
  private running = false;
  constructor(
    private root: HTMLElement,
    canvas: HTMLCanvasElement,
  ) {
    this.profile = this.store.load();
    if (!CLASSES.some((c) => c.id === this.profile.selectedClass))
      this.profile.selectedClass = 'guardian';
    this.audio.enabled = this.profile.settings.sound;
    this.simulation = new Simulation({ mode: 'raid', classId: this.profile.selectedClass });
    this.renderer = new WorldRenderer(canvas);
    this.renderer.setQuality(this.profile.settings.quality);
    this.renderer.onError = (message) => this.toast('Ошибка загрузки модели: ' + message);
    this.root.addEventListener('click', (e) => {
      void this.click(e).catch((error) => this.fail(error));
    });
    this.root.addEventListener('change', (e) => this.change(e));
  }
  async init() {
    this.loading('Пробуждаем забытые земли…');
    this.renderer.engine.runRenderLoop(() => this.frame(performance.now()));
    this.telegram = await connectTelegram(() => {
      if (this.screen === 'battle' && !this.paused && this.simulation.state.status === 'playing')
        this.pause();
      this.human.reset();
    });
    await this.renderer.load(this.simulation.state, true);
    this.running = true;
    this.showHome(false);
    if (import.meta.env.DEV) {
      const app = this;
      (window as unknown as { __raid: unknown }).__raid = {
        get renderer() {
          return app.renderer;
        },
        get input() {
          return app.human;
        },
        get state() {
          return app.simulation.state;
        },
        get simulation() {
          return app.simulation;
        },
        get metrics() {
          return app.renderer.metrics;
        },
        get profile() {
          return app.profile;
        },
        debug: (action: string) => debugAction(app.simulation, action),
      };
    }
  }
  private loading(message: string) {
    this.root.innerHTML = `<div class="loading"><div class="brand"><span class="brand-mark">${icon('swords', 35)}</span><span>RAID <span class="brand-amp">&</span> SIEGE<small>CHRONICLES OF THE FALLEN</small></span></div><div class="loading-line"></div><p>${message}</p></div>`;
  }
  private save() {
    if (!this.store.save(this.profile))
      this.toast('Сохранение недоступно в этом браузере. Прогресс останется до закрытия игры.');
  }
  private async loadWorld(menu: boolean) {
    try {
      await this.renderer.load(this.simulation.state, menu);
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }
  private async showHome(reload = true) {
    this.preview?.dispose();
    this.preview = undefined;
    this.controlsCleanup?.();
    this.controlsCleanup = undefined;
    this.human.reset();
    this.paused = false;
    this.debugVisible = false;
    this.labels.clear();
    this.floatTexts = [];
    this.screen = 'home';
    this.root.innerHTML = home(this.profile, this.mode, this.allies);
    if (reload) {
      this.simulation = new Simulation({
        mode: this.mode,
        classId: this.profile.selectedClass,
        allies: this.allies,
      });
      await this.loadWorld(true);
    } else this.renderer.setMenu(true);
  }
  private showHeroes(slot: number | null = null) {
    this.controlsCleanup?.();
    this.screen = 'heroes';
    this.allySlot = slot;
    this.classSelection = slot === null ? this.profile.selectedClass : this.allies[slot];
    this.renderHeroes();
  }
  private renderHeroes() {
    this.preview?.dispose();
    this.root.innerHTML = heroes(this.profile, this.classSelection, this.allySlot);
    this.preview = new HeroPreview(
      document.getElementById('hero-preview') as HTMLCanvasElement,
      this.classSelection,
    );
  }
  private showInventory() {
    this.preview?.dispose();
    this.preview = undefined;
    this.controlsCleanup?.();
    this.screen = 'inventory';
    this.root.innerHTML = inventory(this.profile, this.itemSelection);
  }
  private async start() {
    this.preview?.dispose();
    this.preview = undefined;
    this.controlsCleanup?.();
    this.screen = 'battle';
    this.paused = true;
    this.human.reset();
    this.bots.clear();
    this.labels.clear();
    this.floatTexts = [];
    this.debugVisible = false;
    this.loading('Собираем отряд…');
    this.simulation = new Simulation({
      mode: this.mode,
      classId: this.profile.selectedClass,
      allies: this.allies,
      seed: Date.now() >>> 0,
      equipment: equipmentStats(this.profile),
    });
    this.simulation.state.id = `${this.simulation.state.id}-${crypto.randomUUID()}`;
    this.reward = null;
    await this.loadWorld(false);
    this.root.innerHTML = hud(this.simulation.state);
    this.controlsCleanup = bindControls(
      this.root,
      this.human,
      (dx, dy, index) => this.renderer.dragAim(this.simulation.player, dx, dy, index),
      () => this.pause(),
      () => this.toggleDebug(),
    );
    this.accumulator = 0;
    this.last = performance.now();
    this.paused = false;
    this.audio.unlock();
    void this.telegram?.fullscreen();
    this.updateHud();
  }
  private frame(now: number) {
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    if (
      this.running &&
      this.screen === 'battle' &&
      !this.paused &&
      this.simulation.state.status === 'playing'
    ) {
      this.accumulator = Math.min(0.25, this.accumulator + dt);
      while (this.accumulator >= FIXED_DT) {
        const s = this.simulation.state,
          commands = [this.human.sample(s)];
        for (const e of s.entities.filter((e) => e.controller === 'BOT')) {
          let bot = this.bots.get(e.id);
          if (!bot) {
            bot = new BotController(e.id, this.profile.settings.difficulty);
            this.bots.set(e.id, bot);
          }
          commands.push(bot.sample(s));
        }
        if (import.meta.env.DEV) debugTick(this.simulation);
        this.simulation.step(commands);
        this.accumulator -= FIXED_DT;
        this.renderer.enqueueEvents(s.events);
        for (const event of s.events) {
          this.audio.play(event);
          this.combatText(event);
          if (event.abilityId && event.sourceId === this.simulation.player.id) {
            const note = document.getElementById('skill-callout');
            if (note) {
              note.textContent = event.name ?? '';
              note.dataset.event = String(event.id);
              note.classList.toggle('super', !!event.ultimate);
              note.hidden = false;
              setTimeout(() => {
                if (note.dataset.event === String(event.id)) note.hidden = true;
              }, 1100);
            }
          }
        }
        if (s.status === 'finished') {
          this.completeMatch();
          break;
        }
      }
    } else if (this.screen !== 'battle' && this.screen !== 'demo') {
      this.simulation.state.time += dt;
      for (const e of this.simulation.state.entities) {
        e.previous = { ...e.position };
        if (e.animationUntil < this.simulation.state.time) e.animation = 'idle';
      }
    }
    if (
      this.screen === 'battle' &&
      this.simulation.state.status === 'finished' &&
      !this.root.querySelector('.results-overlay')
    )
      this.completeMatch();
    if (this.screen === 'demo') {
      this.simulation.state.time += dt;
      this.simulation.combat.update(dt);
      if (now > this.demoUntil) {
        this.showHeroes(this.allySlot);
        void this.loadWorld(true);
      }
    }
    this.human.smoothAim(dt, (x, y, index) =>
      this.renderer.dragAim(this.simulation.player, x, y, index),
    );
    this.renderer.setAim(this.screen === 'battle' && !this.paused ? this.human.preview : undefined);
    if (
      this.screen === 'home' ||
      this.screen === 'battle' ||
      this.screen === 'demo' ||
      !this.running
    )
      this.renderer.render(
        this.simulation.state,
        dt,
        this.screen === 'battle' ? this.accumulator / FIXED_DT : 1,
      );
    if (this.screen === 'battle') {
      this.updateLabels(dt);
      this.uiTime += dt;
      if (this.uiTime > 0.1) {
        this.uiTime = 0;
        this.updateHud();
        this.updateDebug();
      }
    }
  }
  private completeMatch() {
    this.reward = rewardMatch(this.profile, this.simulation.state);
    this.save();
    this.preview?.dispose();
    this.preview = undefined;
    this.controlsCleanup?.();
    this.controlsCleanup = undefined;
    this.human.reset();
    this.debugVisible = false;
    this.root.querySelector('.debug-menu')?.remove();
    this.root.insertAdjacentHTML(
      'beforeend',
      results(this.simulation.state, this.reward, this.profile),
    );
  }
  private updateHud() {
    const s = this.simulation.state,
      p = this.simulation.player;
    const text = (id: string, value: string) => {
      const el = document.getElementById(id);
      if (el && el.textContent !== value) el.textContent = value;
    };
    const width = (id: string, value: number) => {
      const el = document.getElementById(id);
      if (el) el.style.width = `${Math.max(0, Math.min(100, value))}%`;
    };
    const remain = Math.max(0, Math.ceil(s.timeLimit - s.time));
    text(
      'timer',
      `${s.overtime ? '+ ' : ''}${Math.floor(remain / 60)
        .toString()
        .padStart(2, '0')}:${(remain % 60).toString().padStart(2, '0')}`,
    );
    if (s.mode === 'raid') {
      const boss = s.entities.find((e) => e.kind === 'boss');
      text(
        'objective',
        boss
          ? `Хранитель руин · фаза ${s.bossPhase || 1}`
          : ([
              'Очистите вход в руины',
              'Пройдите засаду',
              'Победите культистов',
              'Одолейте элитную стражу',
            ][s.stage] ?? 'Победите Хранителя'),
      );
      width('objective-fill', boss ? (boss.hp / boss.maxHp) * 100 : (s.stage / 4) * 100);
      text(
        'objective-detail',
        boss
          ? `${Math.ceil(boss.hp)} / ${boss.maxHp} HP`
          : `Зона ${s.stage + 1} / 5 · идите на север ↑`,
      );
    } else {
      const point =
        s.points.find((p) => !p.locked && (s.mode === 'hill' || p.owner !== 'A')) ??
        s.points.at(-1)!;
      text(
        'objective',
        s.mode === 'siege'
          ? `Захватите точку ${point.id}`
          : `${Math.floor(s.score.A)} : ${Math.floor(s.score.B)} / 300`,
      );
      width('objective-fill', point.progress * 100);
      text(
        'objective-detail',
        point.contested
          ? 'ТОЧКА ОСПАРИВАЕТСЯ'
          : s.mode === 'siege'
            ? `Рубеж ${s.score.A + 1} / 3 · ${Math.floor(point.progress * 100)}%`
            : point.owner === 'A'
              ? 'Ваш отряд защищает точку'
              : point.owner === 'B'
                ? 'Противник удерживает точку'
                : 'Захватите нейтральную точку',
      );
    }
    const landmark = s.map.landmarks
      ?.filter((l) => distance(l.position, p.position) < l.radius + 7)
      .sort((a, b) => distance(a.position, p.position) - distance(b.position, p.position))[0];
    text('zone-name', landmark?.name ?? s.map.name);
    text('player-hp', `${Math.ceil(p.hp)} / ${p.maxHp}`);
    width('hp-fill', (p.hp / p.maxHp) * 100);
    width('shield-fill', (p.shield / p.maxHp) * 100);
    width('resource-fill', p.resource);
    const names: Record<string, string> = {
      stun: 'Оглушение',
      slow: 'Замедление',
      root: 'Корни',
      poison: 'Яд',
      burn: 'Горение',
      defense: 'Защита',
      power: 'Сила',
      haste: 'Ускорение',
      stealth: 'Скрытность',
      weakness: 'Ослабление',
      taunt: 'Провокация',
      invulnerable: 'Неуязвимость',
    };
    text(
      'statuses',
      p.statuses.map((t) => `${names[t.kind]} ${Math.ceil(t.remaining)}с`).join(' · '),
    );
    for (const e of s.entities.filter((e) => e.team === 'A' && e.kind === 'hero')) {
      const el = document.getElementById('team-' + e.id);
      if (!el) continue;
      el.classList.toggle('dead', !e.alive);
      el.querySelector<HTMLElement>('.health-track i')!.style.width = `${(e.hp / e.maxHp) * 100}%`;
      el.querySelector('.team-hp')!.textContent = e.alive
        ? `${Math.ceil(e.hp)} / ${e.maxHp}`
        : s.mode === 'raid'
          ? 'Герой пал'
          : `Возрождение ${Math.max(0, Math.ceil(e.respawnAt - s.time))}с`;
    }
    const abilities = getClass(p.classId).abilities;
    this.root.querySelectorAll<HTMLElement>('[data-skill]').forEach((button, i) => {
      const cooldown = p.cooldowns[i];
      const charge = i === 3 && p.ultimate < 100;
      button.classList.toggle('on-cooldown', cooldown > 0 || charge);
      button.classList.toggle('no-resource', p.resource < abilities[i].cost);
      button.style.setProperty(
        '--readiness',
        `${i === 3 ? p.ultimate : 100 * (1 - cooldown / abilities[i].cooldown)}%`,
      );
      button.classList.toggle('ready', i === 3 && p.ultimate >= 100 && cooldown <= 0);
      button.querySelector('.cooldown')!.textContent =
        cooldown > 0 ? Math.ceil(cooldown).toString() : charge ? `${Math.floor(p.ultimate)}%` : '';
    });
    const dodge = this.root.querySelector('[data-dodge]');
    if (dodge) {
      dodge.classList.toggle('on-cooldown', p.dodgeCooldown > 0);
      dodge.querySelector('.cooldown')!.textContent =
        p.dodgeCooldown > 0 ? Math.ceil(p.dodgeCooldown).toString() : '';
    }
    const death = document.getElementById('death-notice');
    if (death) {
      death.hidden = p.alive || s.status === 'finished';
      death.textContent =
        s.mode === 'raid'
          ? 'Герой пал. Союзники продолжают бой.'
          : `Возрождение через ${Math.max(0, Math.ceil(p.respawnAt - s.time))} с`;
    }
    this.minimap();
  }
  private minimap() {
    const canvas = document.getElementById('minimap') as HTMLCanvasElement | null,
      ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    const s = this.simulation.state,
      w = canvas.width,
      h = canvas.height;
    const to = (p: { x: number; z: number }) => ({
      x: (p.x / s.map.width + 0.5) * w,
      y: (0.5 - p.z / s.map.depth) * h,
    });
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#73917b35';
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.fillStyle = '#83937c40';
    for (const o of s.map.obstacles) {
      const a = to({ x: o.x - o.w / 2, z: o.z + o.d / 2 });
      ctx.fillRect(a.x, a.y, (o.w / s.map.width) * w, (o.d / s.map.depth) * h);
    }
    for (const p of s.points) {
      const a = to(p.position);
      ctx.strokeStyle = p.owner === 'A' ? '#96c5a6' : p.owner === 'B' ? '#e29b86' : '#d3c493';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const e of s.entities.filter(
      (e) =>
        e.alive &&
        !e.statuses.some((t) => t.kind === 'stealth') &&
        (e.team === 'A' ||
          s.entities.some(
            (a) => a.team === 'A' && a.alive && distance(a.position, e.position) < 18,
          )),
    )) {
      const a = to(e.position);
      ctx.fillStyle =
        e.controller === 'HUMAN_LOCAL' ? '#f4e6ba' : e.team === 'A' ? '#95c8ab' : '#d88370';
      ctx.beginPath();
      ctx.arc(
        a.x,
        a.y,
        e.kind === 'boss' ? 4 : e.controller === 'HUMAN_LOCAL' ? 3 : 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  private updateLabels(dt: number) {
    const layer = document.getElementById('world-labels'),
      s = this.simulation.state,
      p = this.simulation.player;
    if (layer)
      for (const e of s.entities) {
        const visible =
          e.alive &&
          e.id !== p.id &&
          distance(e.position, p.position) < 24 &&
          !e.statuses.some((t) => t.kind === 'stealth');
        let label = this.labels.get(e.id);
        if (visible && !label) {
          label = document.createElement('div');
          label.className = `world-health ${e.team === 'A' ? 'ally' : ''} ${e.kind === 'boss' ? 'boss' : ''}`;
          label.innerHTML = '<i></i><small></small>';
          layer.append(label);
          this.labels.set(e.id, label);
        }
        if (label) {
          label.hidden = !visible;
          if (visible) {
            const xy = this.renderer.screenPosition(e.position, e.kind === 'boss' ? 4.8 : 2.6);
            label.style.left = xy.x + 'px';
            label.style.top = xy.y + 'px';
            label.firstElementChild!.setAttribute('style', `width:${(e.hp / e.maxHp) * 100}%`);
            label.lastElementChild!.textContent = this.showAi
              ? e.aiState
              : e.kind === 'boss'
                ? e.name
                : '';
          }
        }
      }
    for (const f of this.floatTexts) {
      f.age += dt;
      const xy = this.renderer.screenPosition(f.position, 2.8 + f.age);
      f.node.style.left = xy.x + 'px';
      f.node.style.top = xy.y + 'px';
      f.node.style.opacity = String(Math.max(0, 1 - f.age / 1.1));
    }
    this.floatTexts = this.floatTexts.filter((f) => {
      if (f.age > 1.1) {
        f.node.remove();
        return false;
      }
      return true;
    });
  }
  private combatText(event: GameEvent) {
    if (event.type !== 'damage' && event.type !== 'heal') return;
    const layer = document.getElementById('combat-text');
    if (!layer || this.floatTexts.length > 30) return;
    const node = document.createElement('span');
    node.className = `floating-number ${event.type === 'heal' ? 'heal' : ''}`;
    node.style.color = event.color;
    node.textContent = `${event.type === 'heal' ? '+' : ''}${event.value}`;
    layer.append(node);
    this.floatTexts.push({ node, position: { ...event.position }, age: 0 });
  }
  private modal(content: string) {
    this.root.querySelector('.overlay:not(.results-overlay)')?.remove();
    this.root.insertAdjacentHTML(
      'beforeend',
      `<div class="overlay modal-overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="Игровое меню"><button class="icon-button close-modal" data-action="close-modal" aria-label="Закрыть">${icon('close', 19)}</button>${content}</section></div>`,
    );
  }
  private pause() {
    if (this.screen !== 'battle' || this.simulation.state.status === 'finished') return;
    if (this.paused) {
      this.closeModal();
      return;
    }
    this.paused = true;
    this.human.reset();
    this.modal(
      `<div class="modal-heading"><span class="eyebrow">ПРИВАЛ</span><h2>История подождёт</h2></div><p>Сражение приостановлено. Ваш отряд ждёт приказа.</p><div class="pause-actions"><button class="primary" data-action="resume">${icon('play', 18)} Продолжить</button><button class="secondary" data-action="settings">${icon('settings', 18)} Настройки</button><button class="secondary" data-action="restart">${icon('refresh', 18)} Начать заново</button><button class="secondary" data-action="home">В главное меню</button></div>`,
    );
  }
  private closeModal() {
    this.root.querySelector('.modal-overlay')?.remove();
    if (this.screen === 'battle') {
      this.paused = false;
      this.human.reset();
      this.accumulator = 0;
    }
  }
  private async click(event: MouseEvent) {
    const target = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (!target) return;
    this.audio.unlock();
    const action = target.dataset.action;
    if (action === 'home') {
      void this.showHome();
      return;
    }
    if (action === 'heroes') {
      this.showHeroes();
      return;
    }
    if (action === 'inventory') {
      this.showInventory();
      return;
    }
    if (action === 'start' || action === 'restart') {
      await this.start();
      return;
    }
    if (action === 'settings') {
      if (this.screen === 'battle') this.paused = true;
      this.modal(settings(this.profile));
      return;
    }
    if (action === 'guide') {
      this.modal(guide());
      return;
    }
    if (action === 'pause') {
      this.pause();
      return;
    }
    if (action === 'resume' || action === 'close-modal') {
      this.closeModal();
      return;
    }
    if (action === 'debug') {
      this.toggleDebug();
      return;
    }
    if (action === 'upgrades') {
      this.upgrades();
      return;
    }
    if (action === 'buy-upgrade') {
      const cost = 150 + this.profile.upgrades * 100;
      if (this.profile.gold < cost || this.profile.upgrades >= 10) {
        this.toast('Недостаточно золота');
        return;
      }
      this.profile.gold -= cost;
      this.profile.upgrades++;
      this.save();
      this.upgrades();
      return;
    }
    if (action === 'credits') {
      this.modal(
        `<div class="modal-heading"><span class="eyebrow">RAID & SIEGE</span><h2>Мир, который растёт</h2></div><p>Локальный игровой прототип. Один игрок и управляемый ИИ отряд. Сетевая игра пока не реализована.</p><div class="credits-list"><span>Модели и анимации: <a href="https://kaylousberg.com/" target="_blank" rel="noopener">Kay Lousberg / KayKit</a> · CC0</span><span>Adventurers · Skeletons · Dungeon Remastered</span><span>Шрифт Manrope: SIL Open Font License</span><span>Движок: Babylon.js · Apache 2.0</span></div><p class="muted">Пять базовых моделей героев, варианты классов и стилизованное окружение. Это прототип графики; 15 полностью уникальных моделей и тесты на Android/iOS ещё нужны. Целевые 30–60 FPS на телефонах не подтверждены.</p>`,
      );
      return;
    }
    if (target.dataset.mode) {
      const scrollTop = this.root.querySelector('.menu-screen')?.scrollTop ?? 0;
      this.mode = target.dataset.mode as Mode;
      void this.showHome();
      this.root.querySelector('.menu-screen')?.scrollTo(0, scrollTop);
      return;
    }
    if (target.dataset.ally !== undefined) {
      this.showHeroes(Number(target.dataset.ally));
      return;
    }
    if (target.dataset.class) {
      this.classSelection = target.dataset.class;
      this.renderHeroes();
      return;
    }
    if (target.dataset.selectClass) {
      if (this.allySlot === null) this.profile.selectedClass = target.dataset.selectClass;
      else this.allies[this.allySlot] = target.dataset.selectClass;
      this.save();
      void this.showHome();
      return;
    }
    if (target.hasAttribute('data-demo-ult')) {
      await this.demoUltimate();
      return;
    }
    if (target.dataset.item) {
      this.itemSelection = target.dataset.item;
      this.showInventory();
      return;
    }
    if (target.dataset.equip) {
      if (equip(this.profile, target.dataset.equip)) {
        this.save();
        this.showInventory();
        this.toast('Снаряжение обновлено');
      }
      return;
    }
    if (target.dataset.setting === 'sound') {
      this.profile.settings.sound = !this.profile.settings.sound;
      this.audio.enabled = this.profile.settings.sound;
      this.save();
      this.modal(settings(this.profile));
      return;
    }
    if (import.meta.env.DEV && target.dataset.debug) {
      try {
        const d = target.dataset.debug;
        if (d === 'restart') {
          await this.start();
          return;
        }
        if (d === 'ai') this.showAi = !this.showAi;
        else if (d === 'nav') {
          this.showNav = !this.showNav;
          this.renderer.showNavigation(this.showNav, this.simulation.state);
        } else debugAction(this.simulation, d);
      } catch (e) {
        this.toast(e instanceof Error ? e.message : 'Действие недоступно');
      }
    }
  }
  private change(event: Event) {
    const input = event.target as HTMLSelectElement;
    if (input.dataset.setting === 'quality' && ['low', 'medium', 'high'].includes(input.value)) {
      this.profile.settings.quality = input.value as Profile['settings']['quality'];
      this.renderer.setQuality(this.profile.settings.quality);
      this.save();
    }
    if (
      input.dataset.setting === 'difficulty' &&
      ['easy', 'normal', 'hard'].includes(input.value)
    ) {
      this.profile.settings.difficulty = input.value as Profile['settings']['difficulty'];
      this.save();
    }
    if (import.meta.env.DEV && input.dataset.debugClass !== undefined) {
      this.profile.selectedClass = input.value;
      this.save();
      void this.start();
    }
  }
  private upgrades() {
    const n = this.profile.upgrades,
      cost = 150 + n * 100;
    this.modal(
      `<div class="modal-heading"><span class="eyebrow">ПУТЬ ГЕРОЯ</span><h2>Станьте сильнее</h2></div><div class="upgrade-art">${icon('sun', 65)}<b>${n} / 10</b><small>+${n * 25} HP · +${n * 3} атаки · +${n} защиты</small></div><p>Каждое улучшение даёт всем вашим героям +25 HP, +3 атаки и +1 защиты в рейдах. В PvP усиления нормализованы.</p><button class="primary" data-action="buy-upgrade" ${n >= 10 || this.profile.gold < cost ? 'disabled' : ''}>${icon('coin', 19)} ${n >= 10 ? 'Достигнут максимум' : `Улучшить за ${cost} золота`}</button>`,
    );
  }
  private async demoUltimate() {
    this.preview?.dispose();
    this.preview = undefined;
    this.screen = 'demo';
    this.root.innerHTML = `<div class="demo-caption">${getClass(this.classSelection).abilities[3].name}</div>`;
    this.simulation = new Simulation({ mode: 'hill', classId: this.classSelection });
    const p = this.simulation.player;
    p.ultimate = 100;
    p.resource = 100;
    for (const e of this.simulation.state.entities) {
      if (e.team === 'B') {
        e.position = { x: p.position.x + (Number(e.id.slice(-1)) - 1) * 2, z: p.position.z + 4 };
        e.previous = { ...e.position };
      }
      if (e.team === 'A') e.hp *= 0.5;
    }
    await this.loadWorld(false);
    this.simulation.combat.cast(p, 3, 'B1', { x: p.position.x, z: p.position.z + 4 });
    this.demoUntil = performance.now() + 3000;
  }
  private toggleDebug() {
    if (!import.meta.env.DEV || this.screen !== 'battle') return;
    this.debugVisible = !this.debugVisible;
    this.root.querySelector('.debug-menu')?.remove();
    if (this.debugVisible)
      this.root.insertAdjacentHTML(
        'beforeend',
        `<aside class="debug-menu"><h3>DEV · F10</h3><select data-debug-class aria-label="Класс отладки">${CLASSES.map((c) => `<option value="${c.id}" ${c.id === this.profile.selectedClass ? 'selected' : ''}>${c.name}</option>`).join('')}</select>${[
          ['invulnerable', 'Бессмертие вкл/выкл'],
          ['heal', 'Восстановить HP и ресурс'],
          ['cooldowns', 'Сбросить перезарядки'],
          ['ultimate', 'Зарядить ультимейт'],
          ['enemy', 'Создать врага'],
          ['ally', 'Добавить союзника (лимит 3)'],
          ['restart', 'Перезапустить матч'],
          ['victory', 'Мгновенная победа'],
          ['ai', 'Состояния ИИ'],
          ['nav', 'Коллизии и навигация'],
        ]
          .map(([id, n]) => `<button data-debug="${id}">${n}</button>`)
          .join(
            '',
          )}<select data-setting="quality" aria-label="Графика в отладке">${['low', 'medium', 'high'].map((q) => `<option ${q === this.profile.settings.quality ? 'selected' : ''}>${q}</option>`).join('')}</select><pre id="debug-metrics"></pre></aside>`,
      );
  }
  private updateDebug() {
    if (!import.meta.env.DEV || !this.debugVisible) return;
    const el = document.getElementById('debug-metrics');
    if (!el) return;
    const m = this.renderer.metrics,
      mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    el.textContent =
      `FPS: ${m.fps} · кадр ${m.frameMs} ms\nDraw calls: ${m.drawCalls} · meshes: ${m.meshes}\nJS heap: ${mem ? (mem.usedJSHeapSize / 1048576).toFixed(1) + ' MB' : 'API недоступен'}\nTick: ${this.simulation.state.tick}\nБессмертие: ${isInvulnerable(this.simulation) ? 'вкл' : 'выкл'}\n` +
      this.simulation.state.entities
        .filter((e) => e.alive)
        .map((e) => `${e.id}: ${e.aiState}`)
        .join('\n');
  }
  toast(message: string) {
    document.querySelector('.toast')?.remove();
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    document.body.append(node);
    setTimeout(() => node.remove(), 4000);
  }
  fail(error: unknown) {
    console.error(error);
    this.root.innerHTML = `<div class="loading"><div class="load-error">${icon('shield', 45)}<h2>Мир не удалось загрузить</h2><p>${escapeHtml(error instanceof Error ? error.message : 'Проверьте поддержку WebGL и доступ к файлам игры.')}</p><button class="primary" onclick="location.reload()">Попробовать снова</button></div></div>`;
  }
}
