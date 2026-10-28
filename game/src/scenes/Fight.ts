import Phaser from "phaser";
import { rgb, type Arena, type BossEntry, type Content, type Hero } from "../content";
import { FPS, World, type Ev, type Unit, type Projectile, type Telegraph } from "../sim/world";
import { ui, uiFrame } from "../ui";

const FONT = "monospace";
const ARENA_PX = 660;            // the arena's longer side on screen
const AY = 40;
const ROUNDS_TO_WIN = 2;
const INTRO_S = 1.7;

type DuelData = { mode: "duel"; p1: Hero; p2: Hero; twoPlayer: boolean; arena: Arena; wins: [number, number]; round: number };
type BossData = { mode: "boss"; p1: Hero; allies: Hero[]; boss: BossEntry };
type FightData = DuelData | BossData;
type UnitView = { shadow: Phaser.GameObjects.Ellipse; body: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
                  blades: (Phaser.GameObjects.Image | null)[]; bar?: Phaser.GameObjects.Graphics; baseScale: number };

/**
 * One duel round or one boss raid: the ported video sim, drawn the way the Shorts draw it,
 * with players steering. In a raid you control the first hero; the other two are AI.
 */
export class FightScene extends Phaser.Scene {
  private data_!: FightData;
  private content!: Content;
  private world!: World;
  private k = 1;
  private ax = 0;
  private aw = ARENA_PX;
  private ah = ARENA_PX;
  private tele!: Phaser.GameObjects.Graphics;
  private aura?: Phaser.GameObjects.Image;
  private sigil?: Phaser.GameObjects.Image;
  private castUntil = 0;
  private clip!: Phaser.Display.Masks.GeometryMask;
  private acc = 0;
  private started = false;
  private ended = false;
  private views = new Map<number, UnitView>();
  private shots = new Map<number, Phaser.GameObjects.Image | Phaser.GameObjects.Arc>();
  private hud!: Phaser.GameObjects.Graphics;
  private readyText: Phaser.GameObjects.Text[] = [];
  private hpText: Phaser.GameObjects.Text[] = [];     // actual HP on each bar ("62 / 90")
  private timerText!: Phaser.GameObjects.Text;
  private lastSound = new Map<string, number>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() { super("fight"); }

  init(d: FightData) {
    this.data_ = d;
    this.views = new Map();
    this.shots = new Map();
    this.readyText = [];
    this.hpText = [];
    this.acc = 0;
    this.started = false;
    this.ended = false;
    this.aura = undefined;
    this.sigil = undefined;
    this.castUntil = 0;
  }

  private get duel() { return this.data_ as DuelData; }
  private get raid() { return this.data_ as BossData; }
  private get isBoss() { return this.data_.mode === "boss"; }

  create() {
    this.content = this.registry.get("content");
    const rate = this.content.rules.meter_rate;
    if (this.isBoss) {
      const r = this.raid;
      this.world = new World({ fighters: [r.p1, ...r.allies], boss: r.boss, meterRate: rate, maxDuration: 90 });
    } else {
      const d = this.duel;
      this.world = new World({ fighters: [d.p1, d.p2], arena: this.content.rules.arena, meterRate: rate, maxDuration: 60 });
      this.world.mains[1].manualUlt = d.twoPlayer;
    }
    this.world.mains[0].manualUlt = true;
    const W = this.world.W, H = this.world.H;
    this.k = ARENA_PX / Math.max(W, H);
    this.aw = W * this.k;
    this.ah = H * this.k;
    this.ax = 640 - this.aw / 2;
    const bg = this.isBoss ? this.raid.boss.bg : this.duel.arena.bg;
    const map = this.isBoss ? this.raid.boss.assets.map : this.duel.arena.map;
    const stage = this.isBoss ? this.raid.boss.stage : this.duel.arena.name;
    this.cameras.main.setBackgroundColor(rgb(bg));

    // arena: the same whole-arena PixelLab map the videos use
    this.add.rectangle(640, AY + this.ah / 2, this.aw + 16, this.ah + 16, 0x000000, 0.6);
    if (map) this.add.image(640, AY + this.ah / 2, map).setDisplaySize(this.aw, this.ah);
    this.add.text(640, AY + this.ah + 10, stage.toUpperCase(), { fontFamily: FONT, fontSize: "14px", color: "#ffffffaa" }).setOrigin(0.5, 0);
    // warning zones and skill art stay inside the arena, like the videos
    const shape = this.make.graphics({}, false).fillRect(this.ax, AY, this.aw, this.ah);
    this.clip = shape.createGeometryMask();
    this.tele = this.add.graphics().setDepth(8).setMask(this.clip);

    this.hud = this.add.graphics().setDepth(52);   // above the bar frames (their insides are opaque)
    this.drawPanels();
    this.timerText = this.add.text(640, 6, "", { fontFamily: FONT, fontSize: "26px", color: "#ffffff",
      stroke: "#000", strokeThickness: 5 }).setOrigin(0.5, 0).setDepth(51);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ENTER,R,M,ESC") as any;
    kb.on("keydown-SPACE", () => this.ult(0));
    kb.on("keydown-ENTER", () => this.ult(!this.isBoss && this.duel.twoPlayer ? 1 : 0));
    kb.on("keydown-ESC", () => this.scene.start("menu"));

    this.syncViews();
    this.intro();
  }

  // ── round flow ───────────────────────────────────────────────────────

  private intro() {
    if (this.isBoss) {
      const b = this.raid.boss;
      const t = this.banner(b.boss.name.toUpperCase(), "#ff6a4d", 54);
      const voice = b.assets.voice.intro;
      if (voice) this.say(voice, { volume: 0.9 });
      this.time.delayedCall(1500, () => {
        t.destroy();
        const f = this.banner("RAID!", "#ffd34d", 96);
        this.tweens.add({ targets: f, scale: 1.25, alpha: 0, duration: 650, onComplete: () => f.destroy() });
        this.sfx("fight");
      });
      this.time.delayedCall(2000, () => (this.started = true));
      return;
    }
    const t = this.banner(`ROUND ${this.duel.round}`, "#ffffff", 64);
    this.say("announcer/round_fight", { volume: 0.8 });
    this.time.delayedCall(INTRO_S * 600, () => {
      t.destroy();
      const f = this.banner("FIGHT!", "#ffd34d", 96);
      this.tweens.add({ targets: f, scale: 1.25, alpha: 0, duration: 650, onComplete: () => f.destroy() });
      this.sfx("fight");
    });
    this.time.delayedCall(INTRO_S * 1000, () => (this.started = true));
  }

  private finishRaid() {
    const won = this.world.winnerSide === 0, r = this.raid;
    this.time.timeScale = 1;
    this.banner(won ? "BOSS DEFEATED!" : "RAID FAILED", won ? "#ffd34d" : "#ff5a4d", 70);
    this.say(won ? "announcer/boss_defeated" : "announcer/raid_failed", { volume: 0.9 });
    if (won) this.sfx("victory");
    let mvp: Unit | undefined, best = -1;
    for (const u of this.world.mains)
      if (u.side === 0 && (this.world.bossDmg.get(u.uid) ?? 0) > best) { best = this.world.bossDmg.get(u.uid) ?? 0; mvp = u; }
    const mine = Math.round(this.world.bossDmg.get(this.world.mains[0].uid) ?? 0);
    const b = this.world.boss!;
    this.time.delayedCall(1500, () => {
      uiFrame(this, "panel", 640, 400, 600, 250).setDepth(60);
      this.add.text(640, 330, won ? "VICTORY!" : `${r.boss.boss.name.toUpperCase()} SURVIVED (${Math.max(1, Math.ceil(b.hp))} HP)`,
        { fontFamily: FONT, fontSize: won ? "44px" : "26px", color: won ? "#ffd34d" : "#ff8a7a", stroke: "#000", strokeThickness: 6 })
        .setOrigin(0.5).setDepth(61);
      this.add.text(640, 385, `MVP: ${mvp?.name.toUpperCase() ?? "-"}  ·  ${Math.round(best)} DMG`,
        { fontFamily: FONT, fontSize: "22px", color: "#ffffff" }).setOrigin(0.5).setDepth(61);
      this.add.text(640, 418, `YOUR DAMAGE: ${mine}   TIME ${Math.round(this.world.t)}s`,
        { fontFamily: FONT, fontSize: "18px", color: "#d8d2ea" }).setOrigin(0.5).setDepth(61);
      this.add.text(640, 465, "R  retry     M  menu", { fontFamily: FONT, fontSize: "20px", color: "#9fe8ff" })
        .setOrigin(0.5).setDepth(61);
      this.input.keyboard!.once("keydown-R", () => this.scene.restart(r));
      this.input.keyboard!.once("keydown-M", () => this.scene.start("menu"));
    });
  }

  private finish() {
    this.ended = true;
    if (this.isBoss) return this.finishRaid();
    const w = this.world.winnerSide, d = this.duel;
    const wins: [number, number] = [...d.wins];
    if (w !== null) wins[w]++;
    const winner = w === null ? null : w === 0 ? d.p1 : d.p2;
    this.time.timeScale = 1;
    this.banner(winner ? "K.O.!" : "DRAW!", "#ff5a4d", 110);
    if (winner) this.say("announcer/ko", { volume: 0.8 });
    this.time.delayedCall(1300, () => {
      const champ = wins[0] >= ROUNDS_TO_WIN ? d.p1 : wins[1] >= ROUNDS_TO_WIN ? d.p2 : null;
      if (!champ) {
        this.scene.restart({ ...d, wins, round: d.round + 1 });
        return;
      }
      const voice = champ.assets.voice.victory;
      if (voice) this.say(voice);
      this.sfx("victory");
      const who = d.twoPlayer ? (champ === d.p1 ? "PLAYER 1" : "PLAYER 2") : champ === d.p1 ? "YOU" : "AI";
      uiFrame(this, "panel", 640, 370, 560, 230).setDepth(60);
      this.add.text(640, 320, `${champ.name.toUpperCase()} WINS!`, { fontFamily: FONT, fontSize: "44px", color: "#ffd34d",
        stroke: "#000", strokeThickness: 6 }).setOrigin(0.5).setDepth(61);
      this.add.text(640, 372, `${who}  ${wins[0]} - ${wins[1]}`, { fontFamily: FONT, fontSize: "26px", color: "#ffffff" })
        .setOrigin(0.5).setDepth(61);
      this.add.text(640, 425, "R  rematch     M  hero select", { fontFamily: FONT, fontSize: "20px", color: "#9fe8ff" })
        .setOrigin(0.5).setDepth(61);
      this.input.keyboard!.once("keydown-R", () => this.scene.restart({ ...d, wins: [0, 0], round: 1 }));
      this.input.keyboard!.once("keydown-M", () => this.scene.start("menu"));
    });
  }

  private ult(side: number) {
    if (!this.started || this.ended) return;
    const u = this.world.mains[side];
    if (u.manualUlt) this.world.fireUltimate(u) && this.handle(this.world.frameEvents.splice(0));
  }

  // ── frame loop ───────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    if (this.started && !this.ended) {
      this.readInput();
      this.acc += Math.min(delta, 100) / 1000;
      while (this.acc >= 1 / FPS && !this.world.done) {
        this.acc -= 1 / FPS;
        this.world.step();
        this.handle(this.world.frameEvents);
      }
      if (this.world.done) this.finish();
    }
    this.syncViews();
    this.drawTelegraphs();
    this.drawHud();
  }

  private readInput() {
    const k = this.keys, [p1, p2] = this.world.mains, two = !this.isBoss && this.duel.twoPlayer;
    const axis = (l: boolean, r: boolean, u: boolean, d: boolean) => {
      const x = (r ? 1 : 0) - (l ? 1 : 0), y = (d ? 1 : 0) - (u ? 1 : 0);
      const n = Math.hypot(x, y) || 1;
      return { x: x / n, y: y / n };
    };
    const wasd = axis(k.A.isDown, k.D.isDown, k.W.isDown, k.S.isDown);
    const arrows = axis(k.LEFT.isDown, k.RIGHT.isDown, k.UP.isDown, k.DOWN.isDown);
    if (two) {
      p1.input = wasd;
      p2.input = arrows;
    } else {
      p1.input = wasd.x || wasd.y ? wasd : arrows;
    }
  }

  // ── events → effects and sound ───────────────────────────────────────

  /** Play a loaded clip; a missing one is skipped rather than crashing the fight. */
  private say(key: string, cfg?: Phaser.Types.Sound.SoundConfig) {
    if (this.cache.audio.exists(key)) this.sound.play(key, cfg);
  }

  private sfx(name: string, volume = 0.5, gap = 0.06) {
    const now = this.time.now / 1000;
    if (now - (this.lastSound.get(name) ?? -1) < gap) return;
    this.lastSound.set(name, now);
    if (this.cache.audio.exists(`sfx/${name}`)) this.say(`sfx/${name}`, { volume });
  }

  private sx(x: number) { return this.ax + x * this.k; }
  private sy(y: number) { return AY + y * this.k; }

  private handle(evs: Ev[]) {
    for (const e of evs) {
      const u = e.unit !== undefined ? this.world.byUid(e.unit) : undefined;
      switch (e.type) {
        case "damage": {
          const dst = this.world.byUid(e.dst);
          if (e.source === "blade") this.sfx("blade_hit");
          else if (e.source === "projectile") this.sfx("projectile_hit");
          else if (e.source === "shockwave") this.sfx("shockwave_hit");
          else if (e.source === "poison") this.sfx("poison_hit", 0.25, 0.2);
          else if (e.source === "body") this.sfx("bump");
          if (dst?.isMain && e.amount >= 1) this.damageNumber(e.hx, e.hy, e.amount);
          if (e.source === "blade" || e.source === "projectile") this.spark(e.hx, e.hy, this.world.byUid(e.src));
          if (dst?.isMain && e.amount >= 6) this.cameras.main.shake(90, 0.004);
          break;
        }
        case "clash": this.sfx("clash"); this.spark(e.x, e.y); break;
        case "block": this.sfx("block"); break;
        case "bump": this.sfx("bump", 0.35); break;
        case "wall": if (u?.isMain) this.sfx("wall", 0.15, 0.15); break;
        case "shoot": this.sfx("shoot", 0.3, 0.08); break;
        case "heal": this.sfx("heal", 0.3, 0.5); break;
        case "summon": this.sfx("summon"); break;
        case "debuff": this.sfx("debuff", 0.4, 0.3); break;
        case "shockwave": this.sfx("shockwave"); this.ring(e.x, e.y, e.radius, rgb(e.color)); break;
        case "ultimate": if (u) this.cutIn(u, e.shout); break;
        case "ult_ready": this.sfx("ability", 0.5); break;
        case "ability": if (u) this.shout(u.x, u.y - u.radius - 30, `${e.name}!`, "#ffe08a"); break;
        case "boss_skill": this.bossCast(e); break;
        case "boss_impact": this.bossImpact(e as unknown as Telegraph); break;
        case "enraged": this.enrage(); break;
        case "frozen": this.sfx("freeze", 0.5, 0.2); break;
        case "death": {
          this.sfx(e.main ? "death_main" : "death", e.main ? 0.8 : 0.4);
          const big = e.main && (!this.isBoss || e.unit === this.world.boss?.uid || this.world.done);
          if (big) { this.cameras.main.shake(300, 0.012); this.time.timeScale = 0.35; }
          else if (e.main) this.shout(e.x, e.y - 90, "DOWN!", "#ff8a7a");
          this.poof(e.x, e.y);
          break;
        }
      }
    }
  }

  // ── boss visuals ─────────────────────────────────────────────────────

  private bossCast(e: Ev) {
    const b = this.world.boss!;
    this.sfx("warn", 0.45, 0.2);
    this.shout(b.x, b.y - b.radius - 50, `${e.name}!`, "#ff7a5a");
    this.castUntil = this.world.t + (e.warn ?? 0.85);
    const key = this.raid.boss.assets.cast;
    if (key && !this.sigil) this.sigil = this.add.image(0, 0, key).setDepth(7);
  }

  private bossImpact(tg: Telegraph) {
    this.sfx("shockwave", 0.55, 0.05);
    this.cameras.main.shake(140, 0.006);
    const fx = this.raid.boss.assets.fx;
    const key = (tg.impact && this.textures.exists(tg.impact) ? tg.impact : undefined) ?? (tg.fx ? fx[tg.fx] : undefined);
    if (!key || !this.textures.exists(key)) return;
    const im = this.add.image(0, 0, key).setDepth(28).setMask(this.clip);
    const k = this.k;
    if (tg.kind === "beam") {
      const len = Math.min(tg.len!, 1600) * k;
      im.setDisplaySize(len, tg.width! * k * 1.6).setRotation(tg.ang!)
        .setPosition(this.sx(tg.x) + (Math.cos(tg.ang!) * len) / 2, this.sy(tg.y) + (Math.sin(tg.ang!) * len) / 2);
    } else if (tg.kind === "cone") {
      const len = tg.range! * k, wid = 2 * len * Math.tan((tg.half! * Math.PI) / 180);
      im.setDisplaySize(len, wid).setRotation(tg.ang!)
        .setPosition(this.sx(tg.x) + (Math.cos(tg.ang!) * len) / 2, this.sy(tg.y) + (Math.sin(tg.ang!) * len) / 2);
    } else {
      const d = 2 * tg.r! * k * (tg.kind === "nova" ? 1.05 : 1.25);
      im.setDisplaySize(d, d).setPosition(this.sx(tg.x), this.sy(tg.y));
    }
    this.tweens.add({ targets: im, alpha: 0, delay: 180, duration: 420, onComplete: () => im.destroy() });
  }

  private enrage() {
    const b = this.raid.boss;
    this.sfx("enraged", 0.8, 0);
    const voice = b.assets.voice.enraged;
    if (voice) this.say(voice, { volume: 0.9 });
    const t = this.banner("ENRAGED!", "#ff4d4d", 64);
    this.tweens.add({ targets: t, scale: 1.2, alpha: 0, delay: 500, duration: 600, onComplete: () => t.destroy() });
    this.cameras.main.shake(400, 0.01);
    if (b.assets.aura && !this.aura) this.aura = this.add.image(0, 0, b.assets.aura).setDepth(7).setAlpha(0.85);
  }

  /** Red warning zones that fill up until the hit lands (death marks in purple, summons as portals). */
  private drawTelegraphs() {
    const g = this.tele, t = this.world.t, k = this.k;
    g.clear();
    for (const tg of this.world.telegraphs) {
      const p = Math.min(1, Math.max(0, (t - tg.t0) / Math.max(0.05, tg.t_hit - tg.t0)));
      const col = tg.mark ? 0xb05cff : tg.kind === "summon_spot" ? 0x9a6bff : 0xff3b30;
      const x = this.sx(tg.x), y = this.sy(tg.y);
      g.lineStyle(3, col, 0.9);
      if (tg.kind === "circle" || tg.kind === "nova" || tg.kind === "summon_spot") {
        const r = tg.r! * k;
        g.fillStyle(col, 0.14).fillCircle(x, y, r).strokeCircle(x, y, r);
        g.fillStyle(col, 0.3).fillCircle(x, y, r * p);
      } else if (tg.kind === "beam") {
        const len = tg.len! * k, hw = (tg.width! * k) / 2, ca = Math.cos(tg.ang!), sa = Math.sin(tg.ang!);
        const quad = (l: number) => [
          new Phaser.Math.Vector2(x - sa * hw, y + ca * hw), new Phaser.Math.Vector2(x + ca * l - sa * hw, y + sa * l + ca * hw),
          new Phaser.Math.Vector2(x + ca * l + sa * hw, y + sa * l - ca * hw), new Phaser.Math.Vector2(x + sa * hw, y - ca * hw)];
        g.fillStyle(col, 0.14).fillPoints(quad(len), true);
        g.strokePoints(quad(len), true);
        g.fillStyle(col, 0.3).fillPoints(quad(len * p), true);
      } else if (tg.kind === "cone") {
        const r = tg.range! * k, h = (tg.half! * Math.PI) / 180;
        g.fillStyle(col, 0.14).slice(x, y, r, tg.ang! - h, tg.ang! + h).fillPath();
        g.beginPath().slice(x, y, r, tg.ang! - h, tg.ang! + h).strokePath();
        g.fillStyle(col, 0.3).slice(x, y, r * p, tg.ang! - h, tg.ang! + h).fillPath();
      }
    }
    const b = this.world.boss;
    if (b && b.alive) {
      const r = b.radius * k;
      if (this.aura) this.aura.setPosition(this.sx(b.x), this.sy(b.y)).setDisplaySize(r * 3.4, r * 3.4)
        .setRotation(t * 0.6);
      if (this.sigil) {
        const on = t < this.castUntil;
        this.sigil.setVisible(on).setPosition(this.sx(b.x), this.sy(b.y) + r * 0.45).setDisplaySize(r * 3, r * 1.65);
      }
    } else {
      this.aura?.setVisible(false);
      this.sigil?.setVisible(false);
    }
  }

  private banner(text: string, color: string, size: number) {
    return this.add.text(640, AY + this.ah / 2, text, { fontFamily: FONT, fontSize: `${size}px`, color,
      stroke: "#000", strokeThickness: 10 }).setOrigin(0.5).setDepth(70);
  }

  private damageNumber(x: number, y: number, amount: number) {
    const t = this.add.text(this.sx(x), this.sy(y) - 20, `${Math.round(amount)}`, { fontFamily: FONT,
      fontSize: amount >= 8 ? "30px" : "22px", color: amount >= 8 ? "#ffd34d" : "#ffffff", stroke: "#000", strokeThickness: 5 })
      .setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: t.y - 46, alpha: 0, duration: 700, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  private spark(x: number, y: number, owner?: Unit) {
    const key = owner && this.heroOf(owner)?.assets.hit_fx;
    if (key) {
      const im = this.add.image(this.sx(x), this.sy(y), key).setDepth(35).setRotation(Math.random() * Math.PI * 2);
      im.setScale(70 / Math.max(im.width, im.height));
      this.tweens.add({ targets: im, scale: im.scale * 1.5, alpha: 0, duration: 260, onComplete: () => im.destroy() });
    } else {
      const c = this.add.circle(this.sx(x), this.sy(y), 10, 0xffffff).setDepth(35);
      this.tweens.add({ targets: c, scale: 2.5, alpha: 0, duration: 200, onComplete: () => c.destroy() });
    }
  }

  private ring(x: number, y: number, r: number, color: number) {
    const c = this.add.circle(this.sx(x), this.sy(y), r * this.k, color, 0.25).setStrokeStyle(6, color).setDepth(30).setScale(0.2);
    this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: 450, ease: "Cubic.easeOut", onComplete: () => c.destroy() });
  }

  private poof(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const c = this.add.circle(this.sx(x), this.sy(y), 7, 0xffffff, 0.9).setDepth(36);
      this.tweens.add({ targets: c, x: c.x + Math.cos(a) * 60, y: c.y + Math.sin(a) * 60, alpha: 0, scale: 0.3,
                        duration: 420, onComplete: () => c.destroy() });
    }
  }

  private shout(x: number, y: number, text: string, color: string) {
    const t = this.add.text(this.sx(x), Math.max(AY + 16, this.sy(y)), text, { fontFamily: FONT, fontSize: "22px", color,
      stroke: "#000", strokeThickness: 5 }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, delay: 500, duration: 500, onComplete: () => t.destroy() });
  }

  /** The Shorts' ult cut-in: a banner sweeps across with the hero, its shout and its voice line. */
  private cutIn(u: Unit, shout: string) {
    const hero = this.heroOf(u);
    this.sfx("ultimate", 0.7, 0);
    const voice = hero?.assets.voice.ultimate;
    if (voice) this.say(voice, { volume: 0.9 });
    const y = AY + this.ah * 0.3, color = rgb(u.color);
    const c = this.add.container(-700, y).setDepth(65);
    c.add(this.add.rectangle(0, 0, 1400, 92, 0x000000, 0.75));
    c.add(this.add.rectangle(0, -46, 1400, 6, color));
    c.add(this.add.rectangle(0, 46, 1400, 6, color));
    if (hero?.assets.body) {
      const im = this.add.image(-200, 0, hero.assets.body);
      im.setScale(120 / Math.max(im.width, im.height));
      c.add(im);
    }
    c.add(this.add.text(-120, 0, shout, { fontFamily: FONT, fontSize: "46px", color: "#ffd34d", stroke: "#000",
      strokeThickness: 7 }).setOrigin(0, 0.5));
    this.tweens.chain({ targets: c, tweens: [
      { x: 640, duration: 220, ease: "Cubic.easeOut" },
      { x: 700, duration: 700 },
      { x: 2100, duration: 220, ease: "Cubic.easeIn", onComplete: () => c.destroy() },
    ] });
    const aura = hero?.assets.ult_circle;
    if (aura) {
      const im = this.add.image(this.sx(u.x), this.sy(u.y), aura).setDepth(5).setAlpha(0.9);
      im.setScale((u.radius * this.k * 3.2) / Math.max(im.width, im.height));
      this.tweens.add({ targets: im, angle: 90, alpha: 0, duration: 1200, onComplete: () => im.destroy() });
    }
  }

  // ── drawing the world ────────────────────────────────────────────────

  private heroOf(u: Unit): Hero | undefined {
    return this.content.heroes.find((h) => h.id === u.artOwner);
  }

  private bodyKey(u: Unit) {
    if (u.tpl.sprite) return u.tpl.sprite as string;
    const h = this.heroOf(u);
    return u.isMain ? h?.assets.body : h?.assets.summons[u.kind];
  }

  private makeView(u: Unit): UnitView {
    const r = u.radius * this.k;
    const shadow = this.add.ellipse(0, 0, r * 1.7, r * 0.55, 0x000000, 0.35).setDepth(9);
    const key = this.bodyKey(u);
    let body: UnitView["body"], baseScale = 1;
    if (key && this.textures.exists(key)) {
      const im = this.add.image(0, 0, key).setDepth(12);
      baseScale = (2.1 * r * (u.tpl.art_fit?.scale ?? 1)) / Math.max(im.width, im.height);
      im.setScale(baseScale);
      body = im;
    } else {
      body = this.add.circle(0, 0, r, rgb(u.color)).setDepth(12);
    }
    const hero = this.heroOf(u);
    const blades = u.blades.map((b) => {
      const key = u.isMain ? hero?.assets.weapons[b.index] : null;
      return key && this.textures.exists(key) ? this.add.image(0, 0, key).setDepth(11) : null;
    });
    const bar = u.isMain ? undefined : this.add.graphics().setDepth(20);
    return { shadow, body, blades, bar, baseScale };
  }

  private syncViews() {
    const w = this.world, t = w.t;
    for (const u of w.units) {
      let v = this.views.get(u.uid);
      if (!u.alive) {
        if (v) {
          v.shadow.destroy(); v.body.destroy(); v.bar?.destroy();
          v.blades.forEach((b) => b?.destroy());
          this.views.delete(u.uid);
        }
        continue;
      }
      if (!v) { v = this.makeView(u); this.views.set(u.uid, v); }
      const x = this.sx(u.x), y = this.sy(u.y), r = u.radius * this.k;
      // squash-and-bob, like the videos: a little hop and stretch along the motion
      const bob = Math.sin(t * 14 + u.uid) * r * 0.04;
      v.shadow.setPosition(x, y + r * 0.85);
      v.body.setPosition(x, y - r * 0.08 + bob);
      if (v.body instanceof Phaser.GameObjects.Image) {
        const sq = 1 + Math.sin(t * 14 + u.uid) * 0.03;
        v.body.setScale(v.baseScale * sq, v.baseScale / sq);
        const hurt = t - u.lastHurt < 0.1;
        const frozen = t < u.frozenUntil || u.buffs.some((b) => b.stat === "speed" && b.mul < 1);
        if (hurt && u === this.world.boss) v.body.setTint(0xff8f8f);   // the boss is hit all the time: a soft flash
        else if (hurt) v.body.setTintFill(0xffffff);
        else if (frozen) v.body.setTint(0x9fdcff);
        else if (u === this.world.boss && this.world.enraged) v.body.setTint(0xffb0a0);
        else v.body.clearTint();
      }
      u.blades.forEach((b, i) => {
        const im = v!.blades[i];
        if (!im) return;
        const [bx, by, tx, ty, hw] = b.segment();
        const B = [this.sx(bx), this.sy(by)], T = [this.sx(tx), this.sy(ty)];
        const L = Math.hypot(T[0] - B[0], T[1] - B[1]);
        const dx = (T[0] - B[0]) / L, dy = (T[1] - B[1]) / L;
        if (b.style === "shield" || b.style === "bow") {   // upright art held across the swing
          const wpx = 2 * hw * this.k, f = wpx / im.height;
          im.setDisplaySize(im.width * f, wpx).setPosition(B[0] + dx * L / 2, B[1] + dy * L / 2);
        } else {                                           // handle sits inside the ball edge
          const total = 1.25 * L;
          im.setDisplaySize(total, Math.max(2, (im.height * total) / im.width))
            .setPosition(B[0] + dx * 0.375 * L, B[1] + dy * 0.375 * L);
        }
        im.setRotation(Math.atan2(dy, dx));
      });
      if (v.bar) {
        v.bar.clear();
        v.bar.fillStyle(0x000000, 0.7).fillRect(x - r, y - r - 12, 2 * r, 6);
        v.bar.fillStyle(rgb(u.color)).fillRect(x - r, y - r - 12, 2 * r * Math.max(0, u.hp / u.maxHp), 6);
      }
    }
    // projectiles
    const live = new Set<number>();
    for (const p of w.projectiles) {
      live.add(p.uid);
      let im = this.shots.get(p.uid);
      if (!im) { im = this.makeShot(p); this.shots.set(p.uid, im); }
      im.setPosition(this.sx(p.x), this.sy(p.y));
      if (im instanceof Phaser.GameObjects.Image)
        im.setRotation(p.style === "shuriken" ? p.age * 16 : Math.atan2(p.vy, p.vx));
    }
    for (const [uid, im] of this.shots) if (!live.has(uid)) { im.destroy(); this.shots.delete(uid); }
  }

  private makeShot(p: Projectile) {
    const key = this.heroOf(p.owner)?.assets.projectiles[p.style];
    const r = p.radius * this.k;
    if (key && this.textures.exists(key)) {
      const im = this.add.image(0, 0, key).setDepth(25);
      const len = r * ({ arrow: 5.5, fireball: 3.6, shuriken: 2.8, puck: 2.4 } as Record<string, number>)[p.style] || r * 2.6;
      im.setDisplaySize(len, Math.max(2, (im.height * len) / im.width));
      return im;
    }
    return this.add.circle(0, 0, r, rgb(p.color)).setDepth(25);
  }

  // ── HUD ──────────────────────────────────────────────────────────────

  private panelX(side: number) { return side === 0 ? 150 : 1130; }

  private drawPanels() {
    if (this.isBoss) return this.drawRaidPanels();
    const d = this.duel;
    [d.p1, d.p2].forEach((h, side) => {
      const x = this.panelX(side);
      uiFrame(this, "panel", x, 300, 270, 470).setDepth(48);
      uiFrame(this, "portrait", x, 160, 150, 150).setDepth(49);
      if (h.assets.body) {
        const im = this.add.image(x, 160, h.assets.body).setDepth(50);
        im.setScale(110 / Math.max(im.width, im.height));
      }
      const who = side === 0 ? "P1" : d.twoPlayer ? "P2" : "AI";
      this.add.text(x, 70, who, { fontFamily: FONT, fontSize: "18px", color: side === 0 ? "#ffd34d" : "#6ec8ff" })
        .setOrigin(0.5).setDepth(51);
      this.add.text(x, 250, h.name.toUpperCase(), { fontFamily: FONT, fontSize: "24px", color: "#ffffff",
        stroke: "#000", strokeThickness: 4 }).setOrigin(0.5).setDepth(51);
      uiFrame(this, "hp_frame", x, 292, 230, 34).setDepth(51);
      this.hpText[side] = this.hpLabel(x, 292);
      uiFrame(this, "meter_frame", x, 340, 230, 26).setDepth(51);
      this.add.text(x, 368, h.meter?.shout ?? "", { fontFamily: FONT, fontSize: "14px", color: "#9fe8ff" })
        .setOrigin(0.5, 0).setDepth(51);
      const key = side === 0 ? "SPACE" : d.twoPlayer ? "ENTER" : "";
      this.readyText[side] = this.add.text(x, 400, key ? `READY! [${key}]` : "", { fontFamily: FONT, fontSize: "20px",
        color: "#ffd34d", stroke: "#000", strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(51).setVisible(false);
      for (let i = 0; i < ROUNDS_TO_WIN; i++) {
        const won = d.wins[side] > i;
        ui(this, won ? "round_pip_won" : "round_pip", x - 20 + i * 40, 470, 30, won ? 0xffd34d : 0x3a3354).setDepth(51);
      }
    });
  }

  private drawRaidPanels() {
    const r = this.raid, x = 150, bx = 1130;
    uiFrame(this, "panel", x, 330, 270, 560).setDepth(48);
    [r.p1, ...r.allies].forEach((h, i) => {
      const y = i === 0 ? 150 : 420 + (i - 1) * 130;
      const size = i === 0 ? 130 : 90;
      uiFrame(this, "portrait", x - (i === 0 ? 0 : 70), y, size + 20, size + 20).setDepth(49);
      if (h.assets.body) {
        const im = this.add.image(x - (i === 0 ? 0 : 70), y, h.assets.body).setDepth(50);
        im.setScale((size - 20) / Math.max(im.width, im.height));
      }
      if (i === 0) {
        this.add.text(x, 66, "YOU", { fontFamily: FONT, fontSize: "18px", color: "#ffd34d" }).setOrigin(0.5).setDepth(51);
        this.add.text(x, 228, h.name.toUpperCase(), { fontFamily: FONT, fontSize: "22px", color: "#ffffff", stroke: "#000",
          strokeThickness: 4 }).setOrigin(0.5).setDepth(51);
        uiFrame(this, "hp_frame", x, 262, 230, 34).setDepth(51);
        this.hpText[0] = this.hpLabel(x, 262);
        uiFrame(this, "meter_frame", x, 300, 230, 26).setDepth(51);
        this.readyText[0] = this.add.text(x, 318, "READY! [SPACE]", { fontFamily: FONT, fontSize: "18px", color: "#ffd34d",
          stroke: "#000", strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(51).setVisible(false);
      } else {
        this.add.text(x + 30, y - 24, h.name.toUpperCase(), { fontFamily: FONT, fontSize: "16px", color: "#ffffff" })
          .setOrigin(0.5).setDepth(51);
        this.add.text(x + 30, y + 28, "AI", { fontFamily: FONT, fontSize: "13px", color: "#6ec8ff" }).setOrigin(0.5).setDepth(51);
      }
    });
    uiFrame(this, "panel", bx, 330, 270, 560).setDepth(48);
    uiFrame(this, "portrait", bx, 160, 170, 170).setDepth(49);
    const im = this.add.image(bx, 160, r.boss.boss.sprite).setDepth(50);
    im.setScale(140 / Math.max(im.width, im.height));
    this.add.text(bx, 262, r.boss.boss.name.toUpperCase(), { fontFamily: FONT, fontSize: "20px", color: "#ff8a6a",
      stroke: "#000", strokeThickness: 4, align: "center", wordWrap: { width: 240 } }).setOrigin(0.5).setDepth(51);
    uiFrame(this, "hp_frame", bx, 300, 230, 34).setDepth(51);
    this.hpText[1] = this.hpLabel(bx, 300);
    this.readyText[1] = this.add.text(bx, 322, "", { fontFamily: FONT, fontSize: "18px", color: "#ff4d4d",
      stroke: "#000", strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(51);
    this.add.text(bx, 370, r.boss.boss.skills.map((s: any) => s.name).join("\n"), { fontFamily: FONT, fontSize: "14px",
      color: "#d8d2ea", align: "center", lineSpacing: 6 }).setOrigin(0.5, 0).setDepth(51);
  }

  private hpLabel(x: number, y: number) {
    return this.add.text(x, y, "", { fontFamily: FONT, fontSize: "15px", color: "#ffffff", stroke: "#000",
      strokeThickness: 4 }).setOrigin(0.5).setDepth(53);
  }

  private static hpString(u: Unit) {
    return `${Math.max(0, Math.ceil(u.hp - 1e-6))} / ${Math.round(u.maxHp)}`;
  }

  private drawRaidHud() {
    this.hud.clear();
    const g = this.hud, w = this.world, me = w.mains[0], x = 150, bx = 1130;
    const bar = (cx: number, y: number, wd: number, f: number, col: number, h = 14) =>
      g.fillStyle(col).fillRect(cx - wd / 2, y - h / 2, wd * Math.max(0, f), h);
    bar(x, 262, 200, me.hp / me.maxHp, me.hp > 0.3 * me.maxHp ? 0x5ee06a : 0xff5a4d);
    bar(x, 300, 200, me.meterFraction(), 0x6ec8ff, 8);
    const rt = this.readyText[0];
    rt.setVisible(me.ultReady && me.alive);
    if (me.ultReady) rt.setAlpha(0.6 + 0.4 * Math.sin(this.time.now / 120));
    w.mains.slice(1, -1).forEach((u, i) => {
      const y = 420 + i * 130;
      g.fillStyle(0x000000, 0.6).fillRect(x - 20, y - 2, 120, 12);
      bar(x + 40, y + 4, 116, u.hp / u.maxHp, u.alive ? 0x5ee06a : 0x555555, 8);
      g.fillStyle(0x6ec8ff).fillRect(x - 18, y + 14, 116 * u.meterFraction(), 4);
    });
    const b = w.boss!;
    bar(bx, 300, 200, b.hp / b.maxHp, 0xff4d4d);
    g.fillStyle(0xffffff, 0.8).fillRect(bx - 1, 292, 2, 16);   // the enrage line at 50%
    this.readyText[1].setText(w.enraged ? "ENRAGED" : "");
    this.hpText[0].setText(FightScene.hpString(me));
    this.hpText[1].setText(FightScene.hpString(b));
    this.timerText.setText(`${Math.max(0, Math.ceil(w.maxDuration - w.t))}`);
  }

  private drawHud() {
    if (this.isBoss) return this.drawRaidHud();
    const g = this.hud;
    g.clear();
    this.world.mains.forEach((u, side) => {
      const x = this.panelX(side);
      const hp = Math.max(0, u.hp / u.maxHp);
      g.fillStyle(hp > 0.3 ? 0x5ee06a : 0xff5a4d).fillRect(x - 100, 285, 200 * hp, 14);
      g.fillStyle(0x6ec8ff).fillRect(x - 100, 336, 200 * u.meterFraction(), 8);
      this.hpText[side]?.setText(FightScene.hpString(u));
      const rt = this.readyText[side];
      rt.setVisible(u.ultReady && u.alive);
      if (u.ultReady) rt.setAlpha(0.6 + 0.4 * Math.sin(this.time.now / 120));
    });
    const left = Math.max(0, Math.ceil(this.world.maxDuration - this.world.t));
    this.timerText.setText(`${left}`);
  }
}
