import Phaser from "phaser";

/**
 * PixelLab UI art (fight/art/ui/, exported to assets/ui/). Frames are 9-sliced so one piece
 * of art fits any size; pixels are drawn 2x so the art keeps its chunky look. When a piece
 * is missing, a plain shape stands in so the game still runs.
 */
const PX = 2;
/** Border thickness (source pixels) kept unstretched when 9-slicing each frame. */
const SLICE: Record<string, number> = {
  panel: 22, button: 18, button_hover: 18, card: 20, card_selected: 20,
  hp_frame: 10, meter_frame: 8, portrait: 20, ribbon: 14,
};

export const uiKey = (name: string) => `ui/${name}.png`;

export function uiFrame(scene: Phaser.Scene, name: string, x: number, y: number, w: number, h: number) {
  const key = uiKey(name);
  if (!scene.textures.exists(key)) {
    const solid = name === "panel" || name.startsWith("button") || name.startsWith("card");
    return scene.add.rectangle(x, y, w, h, 0x1b1728, solid ? 0.92 : 0).setStrokeStyle(4, 0xc9a13b);
  }
  const s = SLICE[name] ?? 16;
  const tex = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const cut = Math.min(s, Math.floor(tex.width / 2) - 1, Math.floor(tex.height / 2) - 1);
  return scene.add.nineslice(x, y, key, undefined, w / PX, h / PX, cut, cut, cut, cut).setScale(PX);
}

/** A single UI sprite fitted into a size x size box (or a tinted dot when missing). */
export function ui(scene: Phaser.Scene, name: string, x: number, y: number, size: number, fallback = 0xffffff) {
  const key = uiKey(name);
  if (!scene.textures.exists(key)) return scene.add.circle(x, y, size / 2, fallback);
  const im = scene.add.image(x, y, key);
  return im.setScale(size / Math.max(im.width, im.height));
}

export const UI_PIECES = ["panel", "button", "button_hover", "card", "card_selected", "hp_frame", "meter_frame",
  "portrait", "vs_badge", "round_pip", "round_pip_won", "cursor_p1", "cursor_p2", "ribbon", "emblem", "backdrop"];
