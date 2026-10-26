/**
 * Generate the game's sound effects via ElevenLabs, from the game's own sound list.
 *
 * Reuses `everySfx()` (`src/sfxslots.ts`) as the manifest, the same list
 * `src/ui/sound/player.ts` reads at runtime.
 *
 *   npx vite-node tools/generate-sfx.ts        # every clip that does not exist yet
 *   npx vite-node tools/generate-sfx.ts <key>  # regenerate one, e.g. "dragonWakes"
 *
 * Skips a clip that already has a file unless it is the one named key being
 * regenerated - same resumability reasoning as `tools/generate-art.ts`.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { everySfx, type SfxEntry } from "../src/sfxslots";
import { generateSoundEffect } from "./elevenlabs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "../src/assets/sfx");

function outPath(entry: SfxEntry): string {
  return join(OUT_DIR, `${entry.key}.mp3`);
}

async function generateOne(entry: SfxEntry): Promise<void> {
  console.log(`  → ${entry.key}: ${entry.prompt}`);
  const mp3 = await generateSoundEffect({
    text: entry.prompt,
    durationSeconds: entry.durationSeconds,
  });
  writeFileSync(outPath(entry), mp3);
  console.log(`    saved ${outPath(entry)} (${mp3.length} bytes)`);
}

async function all(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const entries = everySfx();
  let done = 0;
  let skipped = 0;
  for (const entry of entries) {
    if (existsSync(outPath(entry))) {
      skipped++;
      continue;
    }
    await generateOne(entry);
    done++;
  }
  console.log(`\nDone: ${done} generated, ${skipped} already had a file.`);
}

async function one(key: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const entry = everySfx().find((e) => e.key === key);
  if (!entry) {
    console.error(`No such sfx key: "${key}". Run with no arguments for the full list.`);
    process.exitCode = 1;
    return;
  }
  await generateOne(entry);
}

const key = process.argv[2];
if (key) await one(key);
else {
  console.log(`Generating up to ${everySfx().length} sound effects into src/assets/sfx/...`);
  await all();
}
