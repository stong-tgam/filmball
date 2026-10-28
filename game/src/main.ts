import Phaser from "phaser";
import { loadContent } from "./content";
import { BootScene } from "./scenes/Boot";
import { MenuScene } from "./scenes/Menu";
import { FightScene } from "./scenes/Fight";

export const VIEW_W = 1280;
export const VIEW_H = 720;

loadContent().then((content) => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: "#0d0b14",
    pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, MenuScene, FightScene],
  });
  game.registry.set("content", content);
  if (import.meta.env.DEV) (window as any).game = game;   // handy for debugging in the console
});
