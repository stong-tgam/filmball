import Phaser from "phaser";
import { rgb, type BossEntry, type Content, type Hero } from "../content";
import { ui, uiFrame, uiKey } from "../ui";

const FONT = "monospace";
type Mode = "ai" | "2p" | "boss";
const MODES: Mode[] = ["ai", "2p", "boss"];
const MODE_LABEL: Record<Mode, string> = { ai: "DUEL: VS AI", "2p": "DUEL: 2 PLAYERS", boss: "BOSS RAID" };

type Card = { box: Phaser.GameObjects.Rectangle; glow: any; x: number; y: number; hero?: Hero; boss?: BossEntry;
              parts: Phaser.GameObjects.GameObject[] };

/**
 * Title + picks. Duel: P1 picks (WASD + Space, or click), then the AI's hero or Player 2's
 * (arrows + Enter). Boss Raid: pick your hero, then the boss; two random heroes join you.
 * Tab cycles the mode.
 */
export class MenuScene extends Phaser.Scene {
  private content!: Content;
  private mode: Mode = "ai";
  private picks: Hero[] = [];
  private cursor = [0, 0];
  private cards: Card[] = [];
  private pointers: Phaser.GameObjects.GameObject[] = [];
  private prompt!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private showingBosses = false;

  constructor() { super("menu"); }

  create() {
    this.content = this.registry.get("content");
    this.picks = [];
    this.cards = [];
    this.showingBosses = false;
    this.mode = this.registry.get("mode") ?? "ai";
    if (this.textures.exists(uiKey("backdrop")))
      this.add.image(640, 360, uiKey("backdrop")).setDisplaySize(1280, 720).setAlpha(0.55);
    if (this.textures.exists(uiKey("emblem"))) ui(this, "emblem", 640, 58, 150).setAlpha(0.9);
    this.add.text(640, 54, "PIXEL HERO FIGHTS", { fontFamily: FONT, fontSize: "52px", color: "#ffd34d",
      stroke: "#000", strokeThickness: 8 }).setOrigin(0.5);
    const btn = uiFrame(this, "button", 640, 112, 360, 46);
    btn.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.nextMode());
    this.modeText = this.add.text(640, 112, "", { fontFamily: FONT, fontSize: "22px", color: "#ffffff" }).setOrigin(0.5);
    this.prompt = this.add.text(640, 160, "", { fontFamily: FONT, fontSize: "24px", color: "#9fe8ff",
      stroke: "#000", strokeThickness: 5 }).setOrigin(0.5);
    this.info = this.add.text(640, 640, "", { fontFamily: FONT, fontSize: "18px", color: "#ffffff", stroke: "#000", strokeThickness: 5,
      align: "center", wordWrap: { width: 1000 } }).setOrigin(0.5);
    this.add.text(640, 700, "P1: WASD + SPACE    P2: ARROWS + ENTER    TAB: switch mode", {
      fontFamily: FONT, fontSize: "14px", color: "#d8d2ea", stroke: "#000", strokeThickness: 4 }).setOrigin(0.5);
    this.buildCards(false);
    this.input.keyboard!.addCapture("TAB,SPACE,UP,DOWN,LEFT,RIGHT");   // keep the browser from moving focus / scrolling
    this.input.keyboard!.on("keydown", (e: KeyboardEvent) => this.key(e.code));
    this.refresh();
  }

  private buildCards(bosses: boolean) {
    for (const c of this.cards) c.parts.forEach((p) => p.destroy());
    this.cards = [];
    this.showingBosses = bosses;
    const items = bosses ? this.content.bosses : this.content.heroes;
    const cols = 5, cw = 200, ch = 200, x0 = 640 - ((cols - 1) * cw) / 2;
    items.forEach((it: Hero | BossEntry, i) => {
      const x = x0 + (i % cols) * cw, y = 300 + Math.floor(i / cols) * (ch + 10);
      const hero = bosses ? undefined : (it as Hero), boss = bosses ? (it as BossEntry) : undefined;
      const parts: Phaser.GameObjects.GameObject[] = [];
      parts.push(uiFrame(this, "card", x, y, cw - 16, ch - 10));
      const glow = uiFrame(this, "card_selected", x, y, cw - 16, ch - 10).setVisible(false);
      const box = this.add.rectangle(x, y, cw - 16, ch - 10, 0x000000, 0.001).setStrokeStyle(4, 0x3a3354)
        .setInteractive({ useHandCursor: true });
      const color = hero ? hero.color : boss!.boss.color;
      parts.push(glow, box, this.add.rectangle(x, y - 10, cw - 40, ch - 70, rgb(color), 0.18));
      const key = hero ? hero.assets.body : boss!.boss.sprite;
      if (key) {
        const im = this.add.image(x, y - 14, key);
        im.setScale((bosses ? 120 : 100) / Math.max(im.width, im.height));
        parts.push(im);
      }
      const name = hero ? hero.name : boss!.boss.name;
      parts.push(this.add.text(x, y + 58, name.toUpperCase(), { fontFamily: FONT, fontSize: bosses ? "15px" : "18px",
        color: "#ffffff", stroke: "#000", strokeThickness: 5 }).setOrigin(0.5));
      box.on("pointerover", () => { this.cursor[this.activePlayer()] = i; this.refresh(); });
      box.on("pointerdown", () => this.pick(i));
      this.cards.push({ box, glow, x, y, hero, boss, parts });
    });
  }

  /** Who is choosing right now: 0 = P1, 1 = P2 (only in 2-player duels). */
  private activePlayer() { return this.mode === "2p" && this.picks.length === 1 ? 1 : 0; }

  private nextMode() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    this.registry.set("mode", this.mode);
    this.picks = [];
    if (this.showingBosses) this.buildCards(false);
    this.refresh();
  }

  private key(code: string) {
    if (code === "Tab") return this.nextMode();
    const p = this.activePlayer(), two = this.mode === "2p";
    const p1 = { KeyA: -1, KeyD: 1, KeyW: -5, KeyS: 5 } as Record<string, number>;
    const p2 = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 } as Record<string, number>;
    // without a second player, P1 can use either set of keys
    const move = p === 0 ? (p1[code] ?? (two ? undefined : p2[code])) : p2[code];
    const n = this.cards.length;
    if (move !== undefined) {
      this.cursor[p] = (this.cursor[p] + move + n) % n;
      this.refresh();
    } else if ((p === 0 && (code === "Space" || (!two && code === "Enter"))) || (p === 1 && code === "Enter")) {
      this.pick(this.cursor[p]);
    } else if (code === "Escape" || code === "Backspace") {
      this.picks.pop();
      if (this.showingBosses) this.buildCards(false);
      this.refresh();
    }
  }

  private pick(i: number) {
    const card = this.cards[i];
    if (card.boss) {                         // boss raid: you + two random heroes vs the boss
      const others = this.content.heroes.filter((h) => h !== this.picks[0]);
      Phaser.Utils.Array.Shuffle(others);
      this.scene.start("fight", { mode: "boss", p1: this.picks[0], allies: others.slice(0, 2), boss: card.boss });
      return;
    }
    this.picks.push(card.hero!);
    if (this.mode === "boss") {
      this.cursor[0] = 0;
      this.buildCards(true);
      this.refresh();
      return;
    }
    if (this.picks.length === 2) {
      const [a, b] = this.picks;
      const arenas = this.content.arenas;
      // like the videos: half the fights on a neutral arena, half on one fighter's home stage
      const homes = arenas.filter((ar) => ar.home === a.id || ar.home === b.id);
      const neutral = arenas.filter((ar) => !ar.home);
      const pool = Math.random() < 0.5 && homes.length ? homes : neutral;
      const arena = pool[Math.floor(Math.random() * pool.length)];
      this.scene.start("fight", { mode: "duel", p1: a, p2: b, twoPlayer: this.mode === "2p", arena, wins: [0, 0], round: 1 });
      return;
    }
    this.refresh();
  }

  private refresh() {
    this.modeText.setText(`${MODE_LABEL[this.mode]}  (TAB)`);
    const p = this.activePlayer();
    let who: string;
    if (this.mode === "boss") who = this.showingBosses ? "Pick the boss to raid" : "Pick your hero (2 random heroes join you)";
    else who = this.picks.length === 0 ? "PLAYER 1: pick your hero"
      : this.mode === "2p" ? "PLAYER 2: pick your hero" : "Pick the AI's hero";
    this.prompt.setText(this.picks.length ? `${who}   (${this.picks[0].name}, ESC = back)` : who);
    const art = this.textures.exists(uiKey("card_selected"));
    this.cards.forEach((c, i) => {
      const chosen = !!c.hero && this.picks.includes(c.hero);
      const hover = i === this.cursor[p];
      c.glow.setVisible(art && (hover || chosen));
      c.box.setStrokeStyle(hover ? 6 : 4, chosen ? 0x7dff8a : hover ? (p === 0 ? 0xffd34d : 0x6ec8ff) : 0x3a3354,
        art ? (chosen ? 1 : 0) : 1);
    });
    this.pointers.forEach((o) => o.destroy());
    const cur = this.cards[this.cursor[p] % this.cards.length];
    this.pointers = [ui(this, p === 0 ? "cursor_p1" : "cursor_p2", cur.x, cur.y - 112, 34, p === 0 ? 0xffd34d : 0x6ec8ff)];
    if (cur.hero) {
      const h = cur.hero;
      this.info.setText(`${h.name}: ${h.blurb ?? ""}\nULT: ${h.meter?.shout ?? "-"}   HP ${h.hp}   SPEED ${h.speed}`);
    } else {
      const b = cur.boss!;
      this.info.setText(`${b.boss.name} (${b.stage})   HP ${b.boss.hp}\n` +
        b.boss.skills.map((s: any) => s.name).join("  ·  "));
    }
  }
}
