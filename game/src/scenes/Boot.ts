import Phaser from "phaser";
import type { Content } from "../content";

/** Loads every exported sprite, map and sound; texture / audio keys are their asset paths. */
export class BootScene extends Phaser.Scene {
  constructor() { super("boot"); }

  preload() {
    const c = this.registry.get("content") as Content;
    const bar = this.add.rectangle(340, 360, 0, 16, 0xffd34d).setOrigin(0, 0.5);
    this.add.rectangle(640, 360, 604, 22).setStrokeStyle(2, 0xffffff);
    this.add.text(640, 320, "PIXEL HERO FIGHTS", { fontFamily: "monospace", fontSize: "28px", color: "#ffffff" }).setOrigin(0.5);
    this.load.on("progress", (p: number) => (bar.width = 600 * p));

    const img = (p?: string | null) => p && !this.textures.exists(p) && this.load.image(p, `assets/${p}`);
    for (const h of c.heroes) {
      const a = h.assets;
      [a.body, a.ult_aura, a.ult_circle, a.ultimate_icon, a.hit_fx, ...a.weapons,
       ...Object.values(a.projectiles), ...Object.values(a.summons)].forEach(img);
      for (const v of Object.values(a.voice)) this.load.audio(v, `assets/${v}`);
    }
    for (const ar of c.arenas) img(ar.map);
    for (const b of c.bosses) {
      const a = b.assets;
      [b.boss.sprite, a.aura, a.cast, a.summon, a.map, ...Object.values(a.fx),
       ...b.boss.skills.map((s: any) => s.impact),
       ...Object.values(b.boss.minions ?? {}).map((m: any) => m.sprite)].forEach(img);
      for (const v of Object.values(a.voice)) this.load.audio(v, `assets/${v}`);
    }
    img("boss/danger_marker.png");
    img("boss/death_mark.png");
    for (const s of c.rules.sounds) this.load.audio(`sfx/${s}`, `assets/sfx/${s}.wav`);
    for (const u of c.rules.ui ?? []) this.load.image(`ui/${u}.png`, `assets/ui/${u}.png`);
    for (const s of ["round_fight", "ko", "boss_defeated", "raid_failed"]) this.load.audio(`announcer/${s}`, `assets/announcer/${s}.mp3`);
  }

  create() {
    this.scene.start("menu");
  }
}
