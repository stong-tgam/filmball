/**
 * The fight rules, ported from fight/fightsim/sim.py (the video sim): same physics (constant
 * speed balls that bounce off walls and each other), spinning blades, projectiles, data-driven
 * abilities, ult meters, buffs, poison, summons and shockwaves, plus the boss raid engine
 * (telegraphed skills: cone, beam, nova, meteors, summon, leap, mark; enrage at 50%). Horde,
 * royale and soccer come later.
 *
 * Game-only additions: a unit can be steered (input direction turns its heading, like the sim's
 * "seek" but toward the stick), and a "manual ult" unit holds a full meter until it fires.
 */

import type { Effect, Hero, Ability } from "../content";

export const FPS = 60;
const SUBSTEPS = 3;

const DEFAULT_STATS: Record<string, number> = {
  speed: 380, armor: 0, body_damage: 0, size: 1, blade_scale: 1, lifesteal: 0, thorns: 0,
  seek: 0, spin_mult: 1,
};
const RULES = { blade_hit_cooldown: 0.5, body_hit_cooldown: 0.4, clash_cooldown: 0.25, wall_jitter_deg: 6 };
const POISON_TICK = 0.5;
const PASSIVE_SOURCES = new Set(["poison", "storm", "lava", "fog", "fire", "ice", "mine", "ball"]);
/** Turn rate (deg/s) of a steered unit toward its input direction. */
export const STEER_DEG = 430;

export type Ev = { t: number; type: string; [k: string]: any };

/** Small seeded RNG (mulberry32) so a round can be replayed from its seed. */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(a: number, b: number) { return a + (b - a) * this.next(); }
}

function norm(x: number, y: number): [number, number] {
  const d = Math.hypot(x, y);
  return d < 1e-9 ? [1, 0] : [x / d, y / d];
}

function closestOnSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number): [number, number] {
  const abx = bx - ax, aby = by - ay;
  const den = abx * abx + aby * aby;
  if (den < 1e-12) return [ax, ay];
  let t = ((px - ax) * abx + (py - ay) * aby) / den;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [ax + abx * t, ay + aby * t];
}

function segSegDist2(a: number[], b: number[]): number {
  const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number) =>
    (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
  const [ax1, ay1, ax2, ay2] = a, [bx1, by1, bx2, by2] = b;
  const d1 = cross(bx1, by1, bx2, by2, ax1, ay1), d2 = cross(bx1, by1, bx2, by2, ax2, ay2);
  const d3 = cross(ax1, ay1, ax2, ay2, bx1, by1), d4 = cross(ax1, ay1, ax2, ay2, bx2, by2);
  if ((d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0)) return 0;
  let best = Infinity;
  const pairs: [number, number, number[]][] = [[ax1, ay1, b], [ax2, ay2, b], [bx1, by1, a], [bx2, by2, a]];
  for (const [px, py, s] of pairs) {
    const [cx, cy] = closestOnSegment(s[0], s[1], s[2], s[3], px, py);
    best = Math.min(best, (px - cx) ** 2 + (py - cy) ** 2);
  }
  return best;
}

const rad = (d: number) => (d * Math.PI) / 180;

export class Blade {
  uid: number; owner: Unit; index = 0;
  style: string; length: number; width: number; gap: number; spin: number; damage: any;
  scaleStat: string; color: number[]; solid: boolean; aim: boolean; angle: number;
  constructor(spec: any, owner: Unit, uid: number, angle: number) {
    this.uid = uid;
    this.owner = owner;
    this.style = spec.style ?? "sword";
    this.length = +(spec.length ?? 120);
    this.width = +(spec.width ?? 24);
    this.gap = +(spec.gap ?? 0);
    this.spin = rad(+(spec.spin ?? 200));
    this.damage = spec.damage ?? 1;
    this.scaleStat = spec.scale_stat ?? "blade_scale";
    this.color = spec.color ?? [200, 205, 215];
    this.solid = spec.solid ?? true;
    this.aim = !!spec.aim;
    this.angle = angle + rad(+(spec.offset_deg ?? 0));
  }
  /** [base x, base y, tip x, tip y, half width] in arena units. */
  segment(): [number, number, number, number, number] {
    const o = this.owner, s = o.stat(this.scaleStat, 1);
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
    const base = o.radius + this.gap;
    const bx = o.x + dx * base, by = o.y + dy * base, tip = this.length * s;
    return [bx, by, bx + dx * tip, by + dy * tip, (this.width * s) / 2];
  }
}

export class Projectile {
  alive = true; age = 0; hit = new Set<number>();
  side: number; radius: number; bounces: number; life: number; pierce: boolean; style: string;
  launch: any; color: number[];
  constructor(public uid: number, public owner: Unit, public x: number, public y: number,
              public vx: number, public vy: number, eff: any, public damage: number) {
    this.side = owner.side;
    this.radius = +(eff.radius ?? 10);
    this.bounces = +(eff.bounces ?? 0);
    this.life = +(eff.life ?? 2.5);
    this.pierce = !!eff.pierce;
    this.style = eff.style ?? "orb";
    this.launch = eff.launch;
    this.color = eff.color ?? owner.color;
  }
}

type Buff = { stat: string; mul: number; add: number; until: number; label: string };
type AbilityState = Ability & { _last: number; _uses: number; _next: number | null };

export class Unit {
  kind: string; name: string; color: number[]; baseRadius: number; maxHp: number; hp: number;
  baseStats: Record<string, number>; buffs: Buff[] = []; dots: any[] = [];
  vx: number; vy: number; blades: Blade[] = []; abilities: AbilityState[] = [];
  meter: any; meterValue = 0; meterActiveUntil = -1; meterActiveLen: number;
  alive = true; lastHurt = -1e9; diedAt: number | null = null;
  launchUntil = -1; launchLen = 1; launchMult = 1; frozenUntil = -1;
  /** Game: steering input (unit vector or 0,0) and ult control. */
  input = { x: 0, y: 0 };
  manualUlt = false; ultReady = false;
  artOwner: string;

  constructor(public world: World, public tpl: any, public side: number, public uid: number,
              public x: number, public y: number, heading: number, public isMain: boolean,
              public summoner: number | null = null) {
    this.kind = tpl.id ?? "unit";
    this.name = tpl.name ?? this.kind;
    this.artOwner = tpl.art_owner ?? this.kind;
    this.color = tpl.color ?? [200, 200, 200];
    this.baseRadius = +(tpl.radius ?? 50);
    this.maxHp = +(tpl.hp ?? 100);
    this.hp = this.maxHp;
    this.baseStats = { ...DEFAULT_STATS };
    if (tpl.speed !== undefined) this.baseStats.speed = +tpl.speed;
    for (const [k, v] of Object.entries(tpl.stats ?? {})) this.baseStats[k] = +(v as number);
    const sc = world.unitScale;
    if (sc !== 1) {
      this.baseStats.size = (this.baseStats.size ?? 1) * sc;
      this.baseStats.blade_scale = (this.baseStats.blade_scale ?? 1) * sc;
      this.baseStats.speed *= 0.5 + 0.5 * sc;
    }
    const sp = this.stat("speed");
    this.vx = Math.cos(heading) * sp;
    this.vy = Math.sin(heading) * sp;
    (tpl.blades ?? []).forEach((b: any, i: number) => {
      const bl = new Blade(b, this, world.nextUid(), world.rng.uniform(0, 2 * Math.PI));
      bl.index = i;
      this.blades.push(bl);
    });
    for (const a of tpl.abilities ?? []) {
      this.abilities.push({ ...a, _last: -1e9, _uses: 0, _next: +(a.every ?? 0) || null });
    }
    this.meter = tpl.meter ? { ...tpl.meter } : null;
    this.meterActiveLen = this.meter ? +(this.meter.active_duration ?? 0) : 0;
  }

  get radius() { return this.baseRadius * this.stat("size", 1); }

  stat(name: string, dflt = 0): number {
    const v = this.baseStats[name] ?? dflt;
    let add = 0, mul = 1;
    for (const b of this.buffs) if (b.stat === name) { add += b.add; mul *= b.mul; }
    return (v + add) * mul;
  }

  speedNow(t: number): number {
    if (t < this.frozenUntil) return this.stat("speed") * 0.02;
    let sp = this.stat("speed");
    if (t < this.launchUntil) {
      const k = (this.launchUntil - t) / this.launchLen;
      sp *= 1 + (this.launchMult - 1) * k * k;
    }
    return sp;
  }

  meterFraction() {
    if (!this.meter) return 0;
    return Math.min(1, this.meterValue / +(this.meter.max ?? 100));
  }
}

export type Telegraph = {
  kind: "cone" | "beam" | "nova" | "circle" | "summon_spot"; name: string; t0: number; t_hit: number; dmg: number;
  x: number; y: number; r?: number; ang?: number; len?: number; width?: number; range?: number; half?: number;
  launch?: number; freeze?: number; burn?: number; pull?: number; fx?: string; impact?: string;
  leap?: boolean; mark?: boolean; follow?: number; minion?: string;
};

export interface BossDef { kind: string; stage: string; bg: number[]; boss: any; assets: any;
                           arena: { width: number; height: number }; unit_scale: number }

export interface DuelSpec {
  fighters: Hero[];
  /** Boss raid: fighters are the heroes (side 0), this is the boss (side 1). */
  boss?: BossDef;
  arena?: { width: number; height: number };
  meterRate?: number;
  maxDuration?: number;
  seed?: number;
}

export class World {
  W: number; H: number; t = 0; frame = 0; rng: Rng;
  units: Unit[] = []; mains: Unit[] = []; projectiles: Projectile[] = [];
  frameEvents: Ev[] = []; done = false; winnerSide: number | null = null;
  maxDuration: number; meterRate: number;
  summons: Record<string, any> = {};
  unitScale = 1;
  bossMode = false;
  boss: Unit | null = null;
  bossSkills: any[] = [];
  telegraphs: Telegraph[] = [];
  enraged = false;
  bossDmg = new Map<number, number>();
  private bossReady = 0;
  private uid = 0;
  private pending: [string, Unit, Effect, number, number][] = [];
  private cooldowns = new Map<string, number>();
  private segs: [Blade, ReturnType<Blade["segment"]>][] = [];

  constructor(spec: DuelSpec) {
    this.rng = new Rng(spec.seed ?? Math.floor(Math.random() * 2 ** 31));
    this.bossMode = !!spec.boss;
    const arena = spec.boss?.arena ?? spec.arena;
    this.W = arena?.width ?? 960;
    this.H = arena?.height ?? 960;
    this.unitScale = spec.boss?.unit_scale ?? 1;
    this.maxDuration = spec.maxDuration ?? 60;
    this.meterRate = spec.meterRate ?? 1.6;
    for (const f of spec.fighters) {
      for (const [sid, s] of Object.entries(f.summons ?? {})) {
        this.summons[sid] ??= { ...(s as any), art_owner: f.id };
      }
    }
    if (spec.boss) {   // heroes in the corners, the boss in the middle (as in the raids)
      const W = this.W, H = this.H, n = spec.fighters.length;
      const corners: [number, number][] = [[0.2 * W, 0.14 * H], [0.8 * W, 0.14 * H],
        n === 3 ? [0.5 * W, 0.88 * H] : [0.2 * W, 0.86 * H], [0.8 * W, 0.86 * H]];
      spec.fighters.forEach((tpl, i) => {
        const u = new Unit(this, tpl, 0, this.nextUid(), ...corners[i], this.rng.uniform(0, 2 * Math.PI), true);
        this.units.push(u);
        this.mains.push(u);
      });
      const b = new Unit(this, spec.boss.boss, 1, this.nextUid(), 0.5 * W, 0.5 * H, this.rng.uniform(0, 2 * Math.PI), true);
      this.units.push(b);
      this.mains.push(b);
      this.boss = b;
      this.bossSkills = (spec.boss.boss.skills ?? []).map((sk: any, i: number) => ({ ...sk, _next: +(sk.first ?? 1 + 0.9 * i) }));
    } else {
      const starts: [number, number][] = [[0.32 * this.W, 0.56 * this.H], [0.68 * this.W, 0.44 * this.H]];
      spec.fighters.slice(0, 2).forEach((tpl, i) => {
        const [sx, sy] = starts[i];
        const u = new Unit(this, tpl, i, this.nextUid(), sx, sy, this.rng.uniform(0, 2 * Math.PI), true);
        this.units.push(u);
        this.mains.push(u);
      });
    }
    for (const u of [...this.units]) this.trigger(u, "start");
    this.aimBlades();
    this.flush();
  }

  // ── helpers ──────────────────────────────────────────────────────────

  nextUid() { return ++this.uid; }

  emit(type: string, kw: Record<string, any> = {}) {
    this.frameEvents.push({ t: this.t, type, ...kw });
  }

  private cool(key: string, seconds: number) {
    const last = this.cooldowns.get(key) ?? -1e9;
    if (this.t - last < seconds) return false;
    this.cooldowns.set(key, this.t);
    return true;
  }

  resolve(value: any, unit: Unit): number {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.startsWith("$")) return unit.stat(value.slice(1));
    if (value && typeof value === "object" && "stat" in value)
      return unit.stat(value.stat) * +(value.mul ?? 1) + +(value.add ?? 0);
    return +value;
  }

  nearestEnemy(u: Unit): Unit | null {
    let best: Unit | null = null, bd = Infinity;
    for (const e of this.units) {
      if (e.alive && e.side !== u.side) {
        const d = (e.x - u.x) ** 2 + (e.y - u.y) ** 2;
        if (d < bd) { best = e; bd = d; }
      }
    }
    return best;
  }

  byUid(uid: number) { return this.units.find((u) => u.uid === uid); }

  // ── main loop ────────────────────────────────────────────────────────

  step() {
    if (this.done) return;
    this.frameEvents = [];
    const dt = 1 / FPS, h = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      this.t += h;
      this.integrate(h);
      this.walls();
      this.bodies();
      this.bladesStep(h);
      this.projectilesStep(h);
      this.renormalize();
      this.flush();
      if (this.done) break;
    }
    if (!this.done) {
      this.perFrame(dt);
      this.flush();
    }
    this.frame++;
    if (this.done) {     // fight over: stretched weapons (a frog's ult tongue) snap back
      for (const u of this.units) {
        const stats = new Set(u.blades.map((bl) => bl.scaleStat));
        u.buffs = u.buffs.filter((b) => !stats.has(b.stat));
      }
    }
    if (!this.done && this.t >= this.maxDuration) {   // time up: the higher HP share wins
      this.done = true;
      if (this.bossMode) {
        this.winnerSide = 1;      // the boss outlasted the raid
      } else {
        const [a, b] = this.mains.map((m) => (m.alive ? m.hp / m.maxHp : 0));
        this.winnerSide = a === b ? null : a > b ? 0 : 1;
      }
      this.emit("timeout", { side: this.winnerSide });
    }
  }

  private alive() { return this.units.filter((u) => u.alive); }

  private aimBlades() {
    for (const u of this.units) {
      if (!u.alive) continue;
      const aimed = u.blades.filter((b) => b.aim);
      if (!aimed.length) continue;
      const e = this.nearestEnemy(u);
      if (!e) continue;
      const a = Math.atan2(e.y - u.y, e.x - u.x);
      for (const b of aimed) b.angle = a;
    }
  }

  private integrate(h: number) {
    for (const u of this.units) {
      if (!u.alive) continue;
      u.x += u.vx * h;
      u.y += u.vy * h;
      const spin = this.t >= u.frozenUntil ? u.stat("spin_mult", 1) : 0;
      for (const b of u.blades) if (!b.aim) b.angle += b.spin * spin * h;
    }
  }

  private walls() {
    for (const u of this.units) {
      if (!u.alive) continue;
      const r = u.radius;
      let hit = false;
      if (u.x - r < 0) { u.x = r; u.vx = Math.abs(u.vx); hit = true; }
      else if (u.x + r > this.W) { u.x = this.W - r; u.vx = -Math.abs(u.vx); hit = true; }
      if (u.y - r < 0) { u.y = r; u.vy = Math.abs(u.vy); hit = true; }
      else if (u.y + r > this.H) { u.y = this.H - r; u.vy = -Math.abs(u.vy); hit = true; }
      if (hit) {
        const j = rad(this.rng.uniform(-RULES.wall_jitter_deg, RULES.wall_jitter_deg));
        const c = Math.cos(j), s = Math.sin(j);
        [u.vx, u.vy] = [u.vx * c - u.vy * s, u.vx * s + u.vy * c];
        if (u.x - r <= 0.001) u.vx = Math.abs(u.vx);
        if (u.x + r >= this.W - 0.001) u.vx = -Math.abs(u.vx);
        if (u.y - r <= 0.001) u.vy = Math.abs(u.vy);
        if (u.y + r >= this.H - 0.001) u.vy = -Math.abs(u.vy);
        this.emit("wall", { unit: u.uid, x: u.x, y: u.y });
        this.trigger(u, "wall");
      }
    }
  }

  private bodies() {
    const alive = this.alive();
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        if (!(a.alive && b.alive)) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.radius + b.radius, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = d2 > 1e-12 ? Math.sqrt(d2) : 1e-6;
        const [nx, ny] = d2 > 1e-12 ? [dx / d, dy / d] : [1, 0];
        const ma = a.radius ** 2, mb = b.radius ** 2, overlap = rr - d;
        a.x -= (nx * overlap * mb) / (ma + mb);
        a.y -= (ny * overlap * mb) / (ma + mb);
        b.x += (nx * overlap * ma) / (ma + mb);
        b.y += (ny * overlap * ma) / (ma + mb);
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          const imp = (2 * rel) / (ma + mb);
          a.vx -= imp * mb * nx; a.vy -= imp * mb * ny;
          b.vx += imp * ma * nx; b.vy += imp * ma * ny;
        }
        if (a.side !== b.side && this.cool(`body|${Math.min(a.uid, b.uid)}|${Math.max(a.uid, b.uid)}`, RULES.body_hit_cooldown)) {
          this.emit("bump", { a: a.uid, b: b.uid, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          const da = a.stat("body_damage"), db = b.stat("body_damage");
          if (da > 0) this.damage(a, b, da, "body");
          if (db > 0 && b.alive && a.alive) this.damage(b, a, db, "body");
        }
      }
    }
  }

  private bladesStep(h: number) {
    const segs: [Blade, ReturnType<Blade["segment"]>][] = [];
    for (const u of this.units) {
      if (!u.alive) continue;
      for (const bl of u.blades) if (bl.solid) segs.push([bl, bl.segment()]);
    }
    this.segs = segs;
    const clashed = new Set<string>();
    for (let i = 0; i < segs.length; i++) {
      const [bi, si] = segs[i];
      for (let j = i + 1; j < segs.length; j++) {
        const [bj, sj] = segs[j];
        if (bi.owner.side === bj.owner.side) continue;
        const lim = si[4] + sj[4];
        if (segSegDist2(si.slice(0, 4), sj.slice(0, 4)) < lim * lim) {
          clashed.add(`${bi.owner.uid}|${bj.owner.uid}`);
          clashed.add(`${bj.owner.uid}|${bi.owner.uid}`);
          if (this.cool(`clash|${Math.min(bi.uid, bj.uid)}|${Math.max(bi.uid, bj.uid)}`, RULES.clash_cooldown)) {
            bi.spin = -bi.spin; bj.spin = -bj.spin;
            bi.angle += bi.spin * h * 2; bj.angle += bj.spin * h * 2;
            this.emit("clash", { a: bi.owner.uid, b: bj.owner.uid, x: (si[2] + sj[2]) / 2, y: (si[3] + sj[3]) / 2 });
            this.trigger(bi.owner, "clash", bj.owner);
            this.trigger(bj.owner, "clash", bi.owner);
          }
        }
      }
    }
    for (const [bl, [bx, by, tx, ty, hw]] of segs) {
      const owner = bl.owner;
      if (!owner.alive) continue;
      for (const e of this.units) {
        if (!e.alive || e.side === owner.side || clashed.has(`${owner.uid}|${e.uid}`)) continue;
        const [cx, cy] = closestOnSegment(bx, by, tx, ty, e.x, e.y);
        const lim = e.radius + hw;
        if ((e.x - cx) ** 2 + (e.y - cy) ** 2 >= lim * lim) continue;
        if (!this.cool(`blade|${bl.uid}|${e.uid}`, RULES.blade_hit_cooldown)) continue;
        const [kx, ky] = norm(e.x - cx, e.y - cy);
        const es = Math.hypot(e.vx, e.vy);
        e.vx = kx * es; e.vy = ky * es;
        const [ox, oy] = norm(owner.x - e.x, owner.y - e.y);
        const os = Math.hypot(owner.vx, owner.vy);
        owner.vx = ox * os; owner.vy = oy * os;
        const dmg = this.resolve(bl.damage, owner);
        if (dmg > 0) this.damage(owner, e, dmg, "blade", cx, cy);
        else this.emit("shove", { unit: owner.uid, x: cx, y: cy });
      }
    }
  }

  private projectilesStep(h: number) {
    if (!this.projectiles.length) return;
    for (const p of [...this.projectiles]) {
      if (!p.alive) continue;
      p.x += p.vx * h; p.y += p.vy * h; p.age += h;
      if (p.age >= p.life) { p.alive = false; continue; }
      const r = p.radius;
      let bounced = false;
      if (p.x - r < 0 || p.x + r > this.W) { p.vx = -p.vx; p.x = Math.min(Math.max(p.x, r), this.W - r); bounced = true; }
      if (p.y - r < 0 || p.y + r > this.H) { p.vy = -p.vy; p.y = Math.min(Math.max(p.y, r), this.H - r); bounced = true; }
      if (bounced) {
        if (p.bounces <= 0) { p.alive = false; this.emit("fizzle", { x: p.x, y: p.y, style: p.style }); continue; }
        p.bounces--;
      }
      let blocked = false;
      for (const [bl, [bx, by, tx, ty, hw]] of this.segs) {
        if (bl.owner.side === p.side || !bl.owner.alive) continue;
        const [cx, cy] = closestOnSegment(bx, by, tx, ty, p.x, p.y);
        if ((p.x - cx) ** 2 + (p.y - cy) ** 2 < (hw + r) ** 2) {
          p.alive = false; blocked = true;
          this.emit("block", { unit: bl.owner.uid, x: p.x, y: p.y });
          this.trigger(bl.owner, "block", p.owner);
          break;
        }
      }
      if (blocked) continue;
      for (const e of this.units) {
        if (!e.alive || e.side === p.side || p.hit.has(e.uid)) continue;
        const lim = e.radius + r;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < lim * lim) {
          p.hit.add(e.uid);
          this.damage(p.owner, e, p.damage, "projectile", p.x, p.y);
          if (p.launch && e.alive) this.launch(p.owner, e, p.vx, p.vy, +(p.launch.mult ?? 2), +(p.launch.duration ?? 0.5));
          if (!p.pierce) { p.alive = false; break; }
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  private renormalize() {
    for (const u of this.units) {
      if (!u.alive) continue;
      const sp = u.speedNow(this.t);
      const [nx, ny] = norm(u.vx, u.vy);
      u.vx = nx * sp; u.vy = ny * sp;
    }
  }

  launch(src: Unit, tgt: Unit, dx: number, dy: number, mult = 2.5, duration = 0.7) {
    if (!tgt.alive || tgt.stat("launch_immune") > 0) return;
    const [nx, ny] = norm(dx, dy);
    mult = Math.max(1, mult * (1 - Math.min(0.8, tgt.stat("stability"))));
    tgt.launchMult = mult;
    tgt.launchLen = Math.max(0.05, duration);
    tgt.launchUntil = this.t + tgt.launchLen;
    const sp = tgt.speedNow(this.t);
    tgt.vx = nx * sp; tgt.vy = ny * sp;
    this.emit("launch", { unit: tgt.uid, src: src.uid, x: tgt.x, y: tgt.y });
  }

  /** Turn u's heading toward angle `want` by at most `degPerSec * dt`. */
  private turnToward(u: Unit, want: number, degPerSec: number, dt: number) {
    const have = Math.atan2(u.vy, u.vx);
    const diff = ((want - have + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const lim = rad(degPerSec) * dt;
    const turn = Math.max(-lim, Math.min(lim, diff));
    const sp = Math.hypot(u.vx, u.vy);
    u.vx = Math.cos(have + turn) * sp;
    u.vy = Math.sin(have + turn) * sp;
  }

  private perFrame(dt: number) {
    const t = this.t;
    this.aimBlades();
    if (this.bossMode) this.bossTick(t);
    for (const u of this.alive()) {
      const free = t >= u.launchUntil && t >= u.frozenUntil;
      const steering = u.isMain && (u.input.x !== 0 || u.input.y !== 0);
      if (free && steering) {
        this.turnToward(u, Math.atan2(u.input.y, u.input.x), STEER_DEG, dt);
      } else if (free && !(u.isMain && u.manualUlt) && this.bossMode && u.side === 0 && this.dodge(u, dt)) {
        // AI allies step out of a telegraph that's about to land (as in the raids)
      } else if (free && !(u.isMain && u.manualUlt)) {   // AI / summons: the video sim's seek
        let seek = u.stat("seek");
        const e = seek !== 0 ? this.nearestEnemy(u) : null;
        if (e) {
          let want = Math.atan2(e.y - u.y, e.x - u.x);
          if (seek < 0) { want += Math.PI; seek = -seek; }
          this.turnToward(u, want, seek, dt);
        }
      }
      for (const a of u.abilities) {
        if (a.on === "timer" && a._next !== null) {
          while (u.alive && t >= a._next) {
            a._next += +(a.every ?? 1);
            this.runAbility(u, a, null);
          }
        }
      }
      if (u.meter && u.meterActiveUntil <= t) this.addMeter(u, +(u.meter.per_second ?? 0) * dt);
      if (u.dots.length) {
        for (const d of u.dots) {
          while (u.alive && d.next <= t && d.next <= d.until + 1e-9) {
            d.next += POISON_TICK;
            this.damage(d.src, u, d.dps * POISON_TICK, "poison");
          }
        }
        u.dots = u.dots.filter((d) => d.until > t);
      }
      if (u.buffs.length) {
        const keep = u.buffs.filter((b) => b.until > t);
        if (keep.length !== u.buffs.length) this.emit("buff_end", { unit: u.uid });
        u.buffs = keep;
      }
    }
  }

  // ── boss raid ────────────────────────────────────────────────────────

  freeze(u: Unit, seconds: number) {
    if (!u.alive) return;
    u.frozenUntil = Math.max(u.frozenUntil, this.t + seconds);
    this.emit("frozen", { unit: u.uid, x: u.x, y: u.y, seconds });
  }

  inTelegraph(tg: Telegraph, x: number, y: number, r: number): boolean {
    if (tg.kind === "circle" || tg.kind === "nova") return Math.hypot(x - tg.x, y - tg.y) <= tg.r! + r;
    const dx = x - tg.x, dy = y - tg.y, ca = Math.cos(tg.ang!), sa = Math.sin(tg.ang!);
    const along = dx * ca + dy * sa, perp = -dx * sa + dy * ca;
    if (tg.kind === "beam") return along >= 0 && along <= tg.len! && Math.abs(perp) <= tg.width! / 2 + r;
    if (tg.kind === "cone") {
      const d = Math.hypot(dx, dy);
      if (d > tg.range! + r || d === 0) return d === 0;
      const diff = (((Math.atan2(dy, dx) - tg.ang! + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      return Math.abs(diff) <= rad(tg.half!) + Math.asin(Math.min(1, r / d));
    }
    return false;
  }

  /** AI hero: if a hit lands on it within 0.5 s, steer out (away from circles, sideways from cones/beams). */
  private dodge(u: Unit, dt: number): boolean {
    for (const tg of this.telegraphs) {
      if (tg.kind === "summon_spot" || tg.t_hit - this.t >= 0.5 || !this.inTelegraph(tg, u.x, u.y, u.radius)) continue;
      let want: number;
      if (tg.kind === "circle" || tg.kind === "nova") want = Math.atan2(u.y - tg.y, u.x - tg.x);
      else {
        const side = -(u.x - tg.x) * Math.sin(tg.ang!) + (u.y - tg.y) * Math.cos(tg.ang!) >= 0 ? 1 : -1;
        want = tg.ang! + (side * Math.PI) / 2;
      }
      this.turnToward(u, want, 400, dt);
      return true;
    }
    return false;
  }

  private bossTick(t: number) {
    const b = this.boss!;
    if (!b.alive) return;
    if (!this.enraged && b.hp < 0.5 * b.maxHp) {         // phase 2
      this.enraged = true;
      b.baseStats.speed *= 1.3;
      b.baseStats.size = (b.baseStats.size ?? 1) * 1.12;
      for (const [stat, add] of Object.entries(b.tpl.enrage ?? {}))
        b.baseStats[stat] = (b.baseStats[stat] ?? 0) + +(add as number);
      this.emit("enraged", { unit: b.uid, x: b.x, y: b.y });
    }
    const phase = this.enraged ? 2 : 1;
    const heroes = this.units.filter((u) => u.alive && u.side === 0 && u.isMain);
    if (heroes.length && t >= this.bossReady) {
      for (const sk of this.bossSkills) {
        if ((sk.phase ?? 1) > phase || t < sk._next) continue;
        sk._next = t + +sk.every * (this.enraged ? 0.7 : 1);
        this.bossReady = t + 1.1;
        this.cast(b, sk, heroes, t);
        break;
      }
    }
    for (const tg of this.telegraphs) {                  // death marks follow their hero, then lock
      if (tg.follow !== undefined && t < tg.t_hit - 0.45) {
        const h = this.units.find((u) => u.uid === tg.follow && u.alive);
        if (h) { tg.x = h.x; tg.y = h.y; }
      }
    }
    for (const tg of [...this.telegraphs]) {
      if (t < tg.t_hit) continue;
      this.telegraphs = this.telegraphs.filter((g) => g !== tg);
      if (tg.leap && b.alive) {                          // pounce: the boss lands on the marked spot
        b.x = Math.min(Math.max(tg.x, b.radius), this.W - b.radius);
        b.y = Math.min(Math.max(tg.y, b.radius), this.H - b.radius);
      }
      if (tg.kind === "summon_spot") {
        const tpl = b.tpl.minions[tg.minion!];
        const m = new Unit(this, { ...tpl }, 1, this.nextUid(), tg.x, tg.y, this.rng.uniform(0, 6.28), false, b.uid);
        this.units.push(m);
        this.emit("summon", { unit: m.uid, x: m.x, y: m.y, boss: true });
        continue;
      }
      this.emit("boss_impact", { ...tg });
      for (const u of this.units.filter((u) => u.alive && u.side === 0)) {
        if (!this.inTelegraph(tg, u.x, u.y, u.radius)) continue;
        this.damage(b, u, tg.dmg, "spell");
        if (tg.launch && u.alive) this.launch(b, u, u.x - b.x, u.y - b.y, tg.launch, 0.5);
        if (tg.pull && u.alive) this.launch(b, u, b.x - u.x, b.y - u.y, tg.pull, 0.55);
        if (tg.freeze && u.alive) this.freeze(u, tg.freeze);
        if (tg.burn && u.alive) u.dots.push({ src: b, dps: tg.burn, until: t + 2, next: t + POISON_TICK });
      }
    }
  }

  private skillTargets(b: Unit, sk: any, heroes: Unit[], count: number): Unit[] {
    const n = Math.min(count, heroes.length);
    if (sk.target === "farthest")
      return [...heroes].sort((p, q) => Math.hypot(q.x - b.x, q.y - b.y) - Math.hypot(p.x - b.x, p.y - b.y)).slice(0, n);
    const pool = [...heroes], out: Unit[] = [];
    while (out.length < n) out.push(pool.splice(Math.floor(this.rng.next() * pool.length), 1)[0]);
    return out;
  }

  /** Wind up a boss skill: a warning zone now, the hit when the warning runs out. */
  private cast(b: Unit, sk: any, heroes: Unit[], t: number) {
    const target = heroes[Math.floor(this.rng.next() * heroes.length)];
    const ang = Math.atan2(target.y - b.y, target.x - b.x);
    const warn = +(sk.warn ?? 0.85);
    const count = +(this.enraged ? sk.count_enraged ?? sk.count ?? 1 : sk.count ?? 1);
    const base = { name: sk.name, t0: t, t_hit: t + warn, dmg: +(sk.dmg ?? 8), launch: sk.launch, freeze: sk.freeze,
                   burn: sk.burn, fx: sk.fx, pull: sk.pull, impact: sk.impact };
    const add = (tg: Partial<Telegraph>) => this.telegraphs.push({ ...base, ...tg } as Telegraph);
    const kind = sk.type;
    if (kind === "cone") {
      for (let i = 0; i < count; i++)
        add({ kind: "cone", x: b.x, y: b.y, ang: ang + (i - (count - 1) / 2) * rad(+(sk.spread ?? 0)),
              t_hit: base.t_hit + 0.18 * i, range: +(sk.range ?? 600), half: +(sk.half ?? 30) });
    } else if (kind === "leap") {
      this.skillTargets(b, sk, heroes, count).forEach((h, i) =>
        add({ kind: "circle", x: h.x, y: h.y, r: +(sk.r ?? 150), t_hit: base.t_hit + 0.7 * i, leap: true }));
    } else if (kind === "mark") {
      for (const h of this.skillTargets(b, sk, heroes, count))
        add({ kind: "circle", x: h.x, y: h.y, r: +(sk.r ?? 110), follow: h.uid, mark: true });
    } else if (kind === "beam") {
      for (let i = 0; i < count; i++) {
        let ox: number, oy: number, a: number;
        if (sk.origin === "edge") {                      // e.g. kraken tentacles slam in from the arena edge
          const tgt = count > 1 ? heroes[i % heroes.length] : target;
          const edge = Math.floor(this.rng.next() * 4);
          ox = edge < 2 ? this.rng.uniform(80, this.W - 80) : edge === 2 ? 0 : this.W;
          oy = edge < 2 ? (edge === 0 ? 0 : this.H) : this.rng.uniform(80, this.H - 80);
          a = Math.atan2(tgt.y - oy, tgt.x - ox);
        } else {                                         // fan of beams from the boss
          ox = b.x; oy = b.y;
          a = ang + (i - (count - 1) / 2) * rad(+(sk.spread ?? 30));
        }
        add({ kind: "beam", x: ox, y: oy, ang: a, t_hit: base.t_hit + 0.1 * i, len: +(sk.len ?? 1200), width: +(sk.width ?? 90) });
      }
    } else if (kind === "nova") {
      add({ kind: "nova", x: b.x, y: b.y, r: +(sk.r ?? 330) * b.stat("size") });
    } else if (kind === "meteors") {
      const spots = heroes.map((h) => [h.x, h.y]);
      const want = Math.max(+(sk.count ?? 5), this.enraged ? +(sk.count_enraged ?? 0) : 0);
      while (spots.length < want) spots.push([this.rng.uniform(100, this.W - 100), this.rng.uniform(100, this.H - 100)]);
      spots.forEach(([x, y], i) => add({ kind: "circle", x, y, r: +(sk.r ?? 90), t_hit: t + warn + 0.12 * i }));
    } else if (kind === "summon") {
      const n = +(this.enraged ? sk.count_enraged ?? sk.count ?? 3 : sk.count ?? 3);
      for (let i = 0; i < n; i++) {
        const a = this.rng.uniform(0, 2 * Math.PI);
        add({ kind: "summon_spot", x: Math.min(Math.max(b.x + Math.cos(a) * (b.radius + 80), 60), this.W - 60),
              y: Math.min(Math.max(b.y + Math.sin(a) * (b.radius + 80), 60), this.H - 60), r: 40, t_hit: t + 0.6,
              minion: sk.minion });
      }
    }
    this.emit("boss_skill", { unit: b.uid, name: sk.name, skill_type: kind, x: b.x, y: b.y, warn });
  }

  // ── combat ───────────────────────────────────────────────────────────

  damage(attacker: Unit, target: Unit, amount: number, source: string, hx?: number, hy?: number) {
    if (!target.alive || amount <= 0) return;
    const armor = Math.max(0, Math.min(0.9, target.stat("armor")));
    const dealt = amount * (1 - armor) * attacker.stat("dmg_mult", 1);
    target.hp -= dealt;
    target.lastHurt = this.t;
    if (this.bossMode && target === this.boss) {
      const owner = attacker.isMain || attacker.summoner === null ? attacker.uid : attacker.summoner;
      this.bossDmg.set(owner, (this.bossDmg.get(owner) ?? 0) + dealt);
    }
    this.emit("damage", { src: attacker.uid, dst: target.uid, amount: dealt, source, x: target.x, y: target.y,
                          hx: hx ?? target.x, hy: hy ?? target.y });
    if (attacker.alive) {
      if (!PASSIVE_SOURCES.has(source)) this.trigger(attacker, "hit", target);
      this.trigger(attacker, source + "_hit", target);
      const ls = attacker.stat("lifesteal");
      if (ls > 0) this.heal(attacker, dealt * ls);
    }
    if (target.hp > 0) {
      this.trigger(target, "hurt", attacker);
      const frac = target.hp / target.maxHp;
      for (const a of target.abilities)
        if (a.on === "hp_below" && frac < +(a.frac ?? 0.3)) this.runAbility(target, a, attacker);
      const th = target.stat("thorns");
      if (th > 0 && source !== "thorns" && source !== "poison" && attacker.alive)
        this.damage(target, attacker, dealt * th, "thorns");
    } else {
      this.kill(target, attacker);
    }
  }

  heal(unit: Unit, amount: number) {
    if (!unit.alive || amount <= 0) return;
    const before = unit.hp;
    unit.hp = Math.min(unit.maxHp, unit.hp + amount);
    if (unit.hp > before) this.emit("heal", { unit: unit.uid, amount: unit.hp - before, x: unit.x, y: unit.y });
  }

  private kill(unit: Unit, killer: Unit | null) {
    unit.hp = 0;
    unit.alive = false;
    unit.diedAt = this.t;
    this.emit("death", { unit: unit.uid, killer: killer?.uid ?? null, x: unit.x, y: unit.y, main: unit.isMain });
    if (this.bossMode && unit === this.boss) {
      this.telegraphs = [];
      for (const m of this.units.filter((x) => x.alive && x.side === 1)) {
        m.hp = 0; m.alive = false; m.diedAt = this.t;
        this.emit("death", { unit: m.uid, killer: null, x: m.x, y: m.y, main: false });
      }
    }
    if (killer && killer.alive) this.trigger(killer, "kill", unit);
    this.trigger(unit, "death", killer, true);
    for (const ally of this.units)
      if (ally.alive && ally.side === unit.side) this.trigger(ally, "ally_death", unit);
  }

  private checkWin() {
    if (this.done) return;
    if (this.bossMode) {                     // the raid ends when the boss or every hero falls
      const heroes = this.mains.filter((m) => m.side === 0 && m.alive).length;
      if (!this.boss!.alive || !heroes) {
        this.done = true;
        this.winnerSide = this.boss!.alive ? 1 : 0;
        this.emit("victory", { side: this.winnerSide });
      }
      return;
    }
    const sides = new Set(this.units.filter((u) => u.alive).map((u) => u.side));
    // a duel ends when a main falls, even if its summons are still around
    const mainDown = this.mains.find((m) => !m.alive);
    if (mainDown || sides.size < 2) {
      this.done = true;
      const standing = this.mains.filter((m) => m.alive);
      this.winnerSide = standing.length === 1 ? standing[0].side : null;
      this.emit("victory", { side: this.winnerSide });
    }
  }

  // ── triggers & effects ───────────────────────────────────────────────

  addMeter(u: Unit, amount: number) {
    const m = u.meter;
    if (!m || amount <= 0 || u.meterActiveUntil > this.t || !u.alive || u.ultReady) return;
    u.meterValue += amount * this.meterRate;
    if (u.meterValue >= +(m.max ?? 100)) {
      if (u.manualUlt) {            // the player fires it with the ult key
        u.meterValue = +(m.max ?? 100);
        u.ultReady = true;
        this.emit("ult_ready", { unit: u.uid });
        return;
      }
      this.fireUltimate(u);
    }
  }

  /** Fire u's ultimate (player: only once the meter is full). */
  fireUltimate(u: Unit): boolean {
    const m = u.meter;
    if (!m || !u.alive || this.done) return false;
    if (u.manualUlt && !u.ultReady) return false;
    u.ultReady = false;
    u.meterValue = 0;
    u.meterActiveUntil = this.t + u.meterActiveLen;
    this.emit("ultimate", { unit: u.uid, label: m.label ?? "", shout: m.shout ?? "", x: u.x, y: u.y });
    for (const eff of m.on_full ?? []) this.effect(u, eff, null);
    this.trigger(u, "ultimate");
    this.flush();
    return true;
  }

  private trigger(u: Unit, name: string, other: Unit | null = null, allowDead = false) {
    if (!u.alive && !allowDead) return;
    if (u.meter && u.alive) this.addMeter(u, +(u.meter["per_" + name] ?? 0));
    for (const a of u.abilities) if (a.on === name) this.runAbility(u, a, other);
  }

  private runAbility(u: Unit, a: AbilityState, other: Unit | null) {
    if (a.on !== "death" && !u.alive) return;
    if (this.t - a._last < +(a.cooldown ?? 0)) return;
    if (a.max_uses !== undefined && a._uses >= +a.max_uses) return;
    if (a.on === "hp_below" && a._uses >= 1) return;
    if (a.chance !== undefined && this.rng.next() >= +a.chance) return;
    a._last = this.t;
    a._uses++;
    if (a.name) this.emit("ability", { unit: u.uid, name: a.name, x: u.x, y: u.y });
    for (const eff of a.do ?? []) this.effect(u, eff, other);
  }

  private targets(u: Unit, eff: Effect, other: Unit | null): Unit[] {
    const t = eff.target ?? "self";
    if (t === "self") return u.alive || ["summon", "shockwave", "shoot"].includes(eff.type) ? [u] : [];
    if (t === "other") return other && other.alive ? [other] : [];
    if (t === "nearest_enemy") { const e = this.nearestEnemy(u); return e ? [e] : []; }
    if (t === "all_enemies") return this.units.filter((e) => e.alive && e.side !== u.side);
    if (t === "allies") return this.units.filter((a) => a.alive && a.side === u.side && a !== u);
    if (t === "team") return this.units.filter((a) => a.alive && a.side === u.side);
    throw new Error(`unknown target ${t}`);
  }

  private effect(u: Unit, eff: Effect, other: Unit | null) {
    const kind = eff.type;
    if (kind === "summon" || kind === "shockwave" || kind === "shoot") {
      this.pending.push([kind, u, eff, u.x, u.y]);
      return;
    }
    if (kind === "add_meter") { this.addMeter(u, this.resolve(eff.amount ?? 10, u)); return; }
    for (const tgt of this.targets(u, eff, other)) {
      if (kind === "add_stat" || kind === "mul_stat") {
        const cur = tgt.baseStats[eff.stat] ?? 0;
        let v = kind === "add_stat" ? cur + this.resolve(eff.amount ?? 1, u) : cur * +(eff.factor ?? 1);
        if (eff.max !== undefined) v = Math.min(v, +eff.max);
        if (eff.min !== undefined) v = Math.max(v, +eff.min);
        tgt.baseStats[eff.stat] = v;
      } else if (kind === "heal") {
        this.heal(tgt, this.resolve(eff.amount ?? 10, u));
      } else if (kind === "add_max_hp") {
        const amt = this.resolve(eff.amount ?? 10, u);
        tgt.maxHp += amt;
        if (eff.heal ?? true) this.heal(tgt, amt);
      } else if (kind === "buff") {
        tgt.buffs.push({ stat: eff.stat, mul: +(eff.mul ?? 1), add: +(eff.add ?? 0),
                         until: this.t + +(eff.duration ?? 3), label: eff.label ?? "" });
        if (tgt.side !== u.side) this.emit("debuff", { unit: tgt.uid, stat: eff.stat, x: tgt.x, y: tgt.y });
      } else if (kind === "poison") {
        tgt.dots.push({ src: u, dps: this.resolve(eff.dps ?? 2, u), until: this.t + +(eff.duration ?? 3),
                        next: this.t + POISON_TICK });
        this.emit("poisoned", { unit: tgt.uid, x: tgt.x, y: tgt.y });
      } else if (kind === "launch") {
        if (tgt.side !== u.side) this.launch(u, tgt, tgt.x - u.x, tgt.y - u.y, +(eff.mult ?? 2.5), +(eff.duration ?? 0.7));
      } else if (kind === "damage") {
        if (tgt.side !== u.side) this.damage(u, tgt, this.resolve(eff.amount ?? 5, u), eff.source ?? "spell");
      } else {
        throw new Error(`unknown effect type: ${kind}`);
      }
    }
  }

  private flush() {
    while (this.pending.length && !this.done) {
      const [kind, u, eff, x, y] = this.pending.shift()!;
      if (kind === "summon") this.summon(u, eff, x, y);
      else if (kind === "shockwave") this.shockwave(u, eff, x, y);
      else if (kind === "shoot") this.shoot(u, eff, x, y);
    }
    this.checkWin();
  }

  private summon(src: Unit, eff: Effect, x: number, y: number) {
    const base = this.summons[eff.unit];
    if (!base) throw new Error(`summon refers to unknown unit ${eff.unit}`);
    const tpl = { id: eff.unit, ...base };
    const sideCount = this.units.filter((v) => v.alive && v.side === src.side).length;
    const count = Math.min(+(eff.count ?? 1), 30 - sideCount);
    if (count <= 0) return;
    const r = +(tpl.radius ?? 30), ring = src.radius + r + 6, offset = this.rng.uniform(0, 2 * Math.PI);
    const spawned: Unit[] = [];
    for (let k = 0; k < count; k++) {
      const ang = offset + (k * 2 * Math.PI) / count;
      const px = Math.min(Math.max(x + Math.cos(ang) * ring, r), this.W - r);
      const py = Math.min(Math.max(y + Math.sin(ang) * ring, r), this.H - r);
      const m = new Unit(this, tpl, src.side, this.nextUid(), px, py, ang, false, src.uid);
      this.units.push(m);
      spawned.push(m);
    }
    this.emit("summon", { unit: src.uid, kind: eff.unit, count: spawned.length, x, y });
    for (const m of spawned) this.trigger(m, "start");
  }

  private shockwave(src: Unit, eff: Effect, x: number, y: number) {
    const radius = +(eff.radius ?? 220), dmg = this.resolve(eff.damage ?? 0, src);
    this.emit("shockwave", { unit: src.uid, x, y, radius, color: eff.color ?? [255, 255, 255] });
    for (const e of [...this.units]) {
      if (!e.alive || e.side === src.side) continue;
      if (Math.hypot(e.x - x, e.y - y) - e.radius > radius) continue;
      if (eff.knockback ?? true) {
        const [nx, ny] = norm(e.x - x, e.y - y);
        const sp = Math.hypot(e.vx, e.vy);
        e.vx = nx * sp; e.vy = ny * sp;
      }
      if (dmg > 0) this.damage(src, e, dmg, "shockwave");
    }
  }

  private shoot(u: Unit, eff: Effect, x: number, y: number) {
    const count = Math.max(1, +(eff.count ?? 1));
    const aim = eff.aim ?? "nearest";
    const spread = rad(+(eff.spread ?? (count === 1 ? 0 : 30)));
    let angles: number[];
    if (aim === "ring") {
      const base = this.rng.uniform(0, 2 * Math.PI);
      angles = [...Array(count)].map((_, i) => base + (i * 2 * Math.PI) / count);
    } else {
      const target = aim === "nearest" ? this.nearestEnemy(u) : null;
      const base = target ? Math.atan2(target.y - y, target.x - x)
        : aim === "forward" ? Math.atan2(u.vy, u.vx) : this.rng.uniform(0, 2 * Math.PI);
      const step = count > 1 ? spread / (count - 1) : 0;
      angles = [...Array(count)].map((_, i) => base + (i - (count - 1) / 2) * step);
    }
    const speed = this.resolve(eff.speed ?? 900, u), dmg = this.resolve(eff.damage ?? 3, u), r = +(eff.radius ?? 10);
    for (const a of angles) {
      const dx = Math.cos(a), dy = Math.sin(a), start = u.radius + r + 2;
      const px = Math.min(Math.max(x + dx * start, r), this.W - r);
      const py = Math.min(Math.max(y + dy * start, r), this.H - r);
      this.projectiles.push(new Projectile(this.nextUid(), u, px, py, dx * speed, dy * speed, eff, dmg));
    }
    this.emit("shoot", { unit: u.uid, count, style: eff.style ?? "orb", x, y });
  }
}
