/**
 * Content exported from the video pipeline by fight/tools/export_game.py
 * (public/content/*.json). Never edit those files by hand: change the hero in
 * fight/characters/<id>.json and re-run `npm run export`.
 */

export type Effect = { type: string; target?: string; [k: string]: any };
export type Ability = { on: string; do?: Effect[]; every?: number; [k: string]: any };

export interface HeroAssets {
  body: string | null;
  weapons: (string | null)[];
  projectiles: Record<string, string>;
  summons: Record<string, string>;
  voice: Record<string, string>;
  ult_aura?: string;
  ult_circle?: string;
  ultimate_icon?: string;
  hit_fx?: string;
}

export interface Hero {
  id: string;
  name: string;
  emoji?: string;
  blurb?: string;
  color: number[];
  hp: number;
  radius: number;
  speed: number;
  stats?: Record<string, number>;
  blades?: any[];
  abilities?: Ability[];
  meter?: { label: string; shout: string; max: number; on_full: Effect[]; [k: string]: any };
  summons?: Record<string, any>;
  art_fit?: { scale?: number; dy?: number };
  assets: HeroAssets;
}

export interface Arena {
  id: string;
  name: string;
  map: string;
  bg: number[];
  home?: string;
}

export interface Rules {
  arena: { width: number; height: number };
  meter_rate: number;
  sounds: string[];
  ui?: string[];
}

export interface BossEntry {
  kind: string;
  stage: string;
  bg: number[];
  boss: any;
  assets: { fx: Record<string, string>; aura?: string; cast?: string; summon?: string; map?: string;
            voice: Record<string, string> };
  arena: { width: number; height: number };
  unit_scale: number;
}

export interface Content {
  heroes: Hero[];
  bosses: BossEntry[];
  arenas: Arena[];
  rules: Rules;
}

export async function loadContent(): Promise<Content> {
  const get = (name: string) => fetch(`content/${name}.json`).then((r) => r.json());
  const [heroes, arenas, rules, bosses] = await Promise.all([get("heroes"), get("arenas"), get("rules"), get("bosses")]);
  return { heroes, arenas, rules, bosses };
}

export const rgb = (c: number[]) => (c[0] << 16) | (c[1] << 8) | c[2];
