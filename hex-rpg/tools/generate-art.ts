/**
 * Generate the game's pixel art via PixelLab, from the game's own slot list.
 *
 * Reuses `everySlot()` (`src/ui/art/catalogue.ts`) as the manifest - the same list the
 * art room already shows a family, so nothing here can drift from what the game
 * actually honours. See `docs/pixel-art-direction.md` for the prompt reasoning and
 * `CLAUDE.md`'s "Artwork" section for how this plugs into `src/ui/art/Art.tsx`.
 *
 * Two modes, and they are meant to run in that order:
 *
 *   npx vite-node tools/generate-art.ts anchors
 *
 * Generates the 6 anchor images (5 roles + the dragon) with plain text-to-image, and
 * nothing else. **Stop here and look at them** - everything after this call matches
 * its style to these, so a bad anchor is one bad image; a bad style decided here and
 * then matched 49 times over is not.
 *
 *   npx vite-node tools/generate-art.ts bulk
 *
 * Generates every other slot, style-matched against the anchors.
 *
 *   npx vite-node tools/generate-art.ts <slot>
 *
 * Regenerates one slot by its slot id (e.g. `item:Frying Pan`), style-matched against
 * the anchors if they exist, plain text-to-image otherwise.
 *
 * Every mode **skips a slot that already has a file** unless it is the one named slot
 * being regenerated - this is a ~55-call batch against a paid API and will get
 * interrupted or need a single slot redone; re-running the same command should not
 * burn credits on work already done.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { everySlot, type ArtEntry } from "../src/ui/art/catalogue";
import { roleSlot } from "../src/artslots";
import { slotToFilename } from "../src/ui/art/pixelart";
import { generateImage, generateWithStyle } from "./pixellab";
import { TURN_ORDER } from "../src/game/players";
import { monsterSlot } from "../src/artslots";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "../src/ui/art/generated");
const IMAGE_SIZE = { width: 64, height: 64 };

/**
 * The shared style, appended to every prompt. This is the one thing that has to stay
 * identical across all 55 calls - the per-item text is what varies.
 */
const STYLE_SUFFIX =
  "16-bit pixel art, bold flat colors, thick clean dark outline, simple and iconic, " +
  "centered, plain transparent background, no text, no watermark, friendly and " +
  "instantly recognizable, a token for a children's board game";

/**
 * Visual briefs for the slots where the bare name is not enough on its own to draw
 * (a role, a monster, a boss feature) or needs a gentler hand than the game-logic
 * `hint` text would give a model (`ArtEntry.hint` is written for a human reading the
 * rules, not a visual description - "wears a lost fight so nobody else does" draws
 * nothing). Gear and food are not here: their names are already the picture
 * ("Wooden Sword", "Strawberry"), so the generic fallback below is prompt enough.
 */
const VISUAL_BRIEF: Record<string, string> = {
  [roleSlot("knight")]: "a stout young knight in simple armor, holding a shield, brave and kind-faced",
  [roleSlot("rogue")]: "a sly young rogue in a hooded cloak, grinning, light on their feet",
  [roleSlot("scout")]: "a young scout in a forest-green cloak, holding a spyglass, alert and curious",
  [roleSlot("doctor")]: "a young doctor with a medical bag and a kind, reassuring smile",
  [roleSlot("fisherman")]: "a young fisherman in rain boots, holding a fishing rod, cheerful",
  [monsterSlot("mob")]: "a scruffy but harmless-looking bandit, comically sneaky, not scary",
  [monsterSlot("midboss")]: "a big friendly-looking ogre, clumsy and goofy rather than frightening",
  [monsterSlot("finalboss")]: "a magnificent but approachable dragon, colorful scales, impressive but not scary, a worthy final boss for a children's game",
  [monsterSlot("robber")]: "a cartoonish robber in a striped shirt and eye mask, carrying a loot sack",
  [monsterSlot("pirates")]: "a jolly cartoon pirate crew member, eye patch, not threatening",
  "hazard:tornado": "a swirling cartoon tornado, funny rather than frightening, with small objects caught in the spiral",
  "hazard:homeless": "a friendly wandering traveller pulling a small cart of belongings, warm and gentle, never sad",
  "feature:water": "a simple pixel art icon of a river or wave, blue and clear",
  "feature:railway": "a simple pixel art icon of a short stretch of railway track",
  "feature:city": "a simple pixel art icon of a small cluster of town buildings",
  "feature:forest": "a simple pixel art icon of a cluster of trees",
  "feature:field": "a simple pixel art icon of an open grassy field with a few tufts of grass",
};

/** The 6 anchor slots: style gets locked from these before anything else generates. */
const ANCHOR_SLOTS = [...TURN_ORDER.map(roleSlot), monsterSlot("finalboss")];

function promptFor(entry: ArtEntry): string {
  const brief = VISUAL_BRIEF[entry.slot] ?? `${entry.name}, a ${entry.name.length > 20 ? "" : "small "}object or icon`;
  return `${brief}. ${STYLE_SUFFIX}.`;
}

function outPath(slot: string): string {
  return join(OUT_DIR, slotToFilename(slot));
}

async function anchorsMode(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const all = everySlot();
  const anchors = all.filter((e) => ANCHOR_SLOTS.includes(e.slot));
  console.log(`Generating ${anchors.length} anchor images (plain text-to-image)...`);
  for (const entry of anchors) {
    const path = outPath(entry.slot);
    if (existsSync(path)) {
      console.log(`  skip ${entry.slot} (already have ${path})`);
      continue;
    }
    console.log(`  → ${entry.slot}: ${promptFor(entry)}`);
    const png = await generateImage({ description: promptFor(entry), imageSize: IMAGE_SIZE });
    writeFileSync(path, png);
    console.log(`    saved ${path} (${png.length} bytes)`);
  }
  console.log(`\nAnchors done. Look at ${OUT_DIR} before running "bulk".`);
}

function loadAnchorImages(): string[] {
  return ANCHOR_SLOTS.map((slot) => outPath(slot))
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path).toString("base64"));
}

async function generateOne(entry: ArtEntry, styleImages: string[]): Promise<void> {
  const prompt = promptFor(entry);
  console.log(`  → ${entry.slot}: ${prompt}`);
  const png =
    styleImages.length > 0
      ? await generateWithStyle({ description: prompt, styleImages, imageSize: IMAGE_SIZE })
      : await generateImage({ description: prompt, imageSize: IMAGE_SIZE });
  writeFileSync(outPath(entry.slot), png);
  console.log(`    saved ${outPath(entry.slot)} (${png.length} bytes)`);
}

async function bulkMode(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const styleImages = loadAnchorImages();
  if (styleImages.length === 0) {
    console.warn("No anchor images found - run `generate-art.ts anchors` first for a consistent style. Continuing without style matching.");
  }
  const remaining = everySlot().filter((e) => !ANCHOR_SLOTS.includes(e.slot));
  console.log(`Generating ${remaining.length} remaining slots${styleImages.length ? ", style-matched to the anchors" : ""}...`);
  let done = 0;
  let skipped = 0;
  for (const entry of remaining) {
    if (existsSync(outPath(entry.slot))) {
      skipped++;
      continue;
    }
    await generateOne(entry, styleImages);
    done++;
  }
  console.log(`\nDone: ${done} generated, ${skipped} already had a file.`);
}

async function oneSlotMode(slot: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const entry = everySlot().find((e) => e.slot === slot);
  if (!entry) {
    console.error(`No such slot: "${slot}". Run with no arguments to see valid slots, or check src/ui/art/catalogue.ts.`);
    process.exitCode = 1;
    return;
  }
  const styleImages = ANCHOR_SLOTS.includes(slot) ? [] : loadAnchorImages();
  await generateOne(entry, styleImages);
}

const mode = process.argv[2];
if (mode === "anchors") await anchorsMode();
else if (mode === "bulk") await bulkMode();
else if (mode) await oneSlotMode(mode);
else {
  console.log("Usage:");
  console.log("  npx vite-node tools/generate-art.ts anchors   # the 6 style-locking images, do this first");
  console.log("  npx vite-node tools/generate-art.ts bulk      # everything else, style-matched to the anchors");
  console.log("  npx vite-node tools/generate-art.ts <slot>    # regenerate one slot, e.g. 'item:Frying Pan'");
  console.log(`\n${everySlot().length} slots total, ${ANCHOR_SLOTS.length} of them anchors.`);
}
