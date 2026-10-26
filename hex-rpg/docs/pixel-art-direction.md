# Pixel art direction — generated, v0.33

The machine-readable half of the pivot away from `docs/art-direction.md`'s hand-coded
crayon SVG. Everything here is implemented in `tools/generate-art.ts` and
`tools/elevenlabs.ts` / `tools/generate-sfx.ts` - this document explains the choices
those scripts make rather than restating their code. If you change the prompt style,
the anchor set, or the image size, change it there first and update this to match.

## Why pixel art, and why generated

The family has a PixelLab (pixel-art generation) key and an ElevenLabs (audio) key and
asked for the game's art to be recreated with them - see the request and the plan it
was built from in this session's record if you want the full reasoning. The short
version: pixel art is a different, retro-game aesthetic from the crayon look, chosen
deliberately to **replace** it rather than sit alongside it as a second skin, because
maintaining two complete art systems for one game was judged not worth it against one
good one.

## The style, in one sentence

> 16-bit pixel art, bold flat colors, thick clean dark outline, simple and iconic,
> centered, plain transparent background, no text, no watermark, friendly and
> instantly recognizable, a token for a children's board game.

That exact string is `STYLE_SUFFIX` in `tools/generate-art.ts`, appended to every
single prompt. **It is the one thing that has to stay byte-for-byte identical across
all 55 calls** - the per-slot text is what is allowed to vary. If the look needs to
change later, change it here once and regenerate everything, not slot by slot.

It carries over the crayon direction's own values on purpose, just translated to a
different medium: "legibility beats realism", "recognisable before beautiful... under
a second to identify from across the table", and never anything that would read as
frightening or mean-spirited to the seven-year-old this game is built for.

## Resolution

**64×64 pixels**, generated and kept at that size, scaled up in the browser with
`image-rendering: pixelated` (`Art.tsx`) so the pixels stay crisp rather than blurring
- the whole point of pixel art is lost if a 64×64 source gets smoothed on the way to a
100×100 box. This matches how big these things actually render: tokens, chits, list
icons, all around the same on-screen size the old 100×100 SVG viewBox convention used.

## Per-category prompts

Gear and food are **not** given a hand-written visual brief - the item's own name is
already the picture ("Wooden Sword", "Strawberry", "Pot Helmet"), and the generic
fallback (`${entry.name}, a small object or icon`) is prompt enough. Writing one by
hand for all ~38 of them would be a lot of text for no better a result.

Everything else gets a one-line **visual** brief (`VISUAL_BRIEF` in
`tools/generate-art.ts`), because the game-logic `hint` text `catalogue.ts` already
carries (written for a human artist reading the rulebook, e.g. the rogue's "Peeks at
the hint, and goes through pockets for one thing more") describes what a role *does*,
not what it *looks like*, and draws nothing useful on its own:

- **Roles** (5): a short physical description per character - young, friendly,
  recognisable by their gear (a scout's spyglass, a doctor's bag), never menacing.
- **Monsters** (5): deliberately **not scary**. "Comically sneaky", "clumsy and
  goofy", "impressive but not scary" - a monster you fight for a mini-game, not a
  monster that gives a seven-year-old a bad dream.
- **Hazards that are not also monsters** (2, `tornado` and `homeless`/"Traveller"):
  the traveller brief is written with real care - "friendly wandering traveller
  pulling a small cart, warm and gentle, never sad" - because the subject (someone
  without a home) deserves a gentle hand regardless of how harmless the game's own
  framing already is.
- **Boss features** (5): abstract terrain concepts (water, railway, city, forest,
  field), prompted as simple symbolic icons rather than attempting a scene.

## The anchor set, and why bulk generation waits for it

`ANCHOR_SLOTS` is the 5 roles plus the dragon (`monster:finalboss`) - 6 images,
generated first with plain text-to-image (`generateImage`), with nothing to match yet.
**Stop after these and look at them before running `bulk`.** Every other slot then
generates with `generateWithStyle` (PixelLab's bitforge), using the knight anchor as its
one style image - bitforge copies colours as well as linework, so the knight's palette
carries across the set. The calls are the same ones `fight/tools/pixellab_gen.py` already
makes successfully (v2 API, pixflux then bitforge, same outline and shading settings), so
the full set reads as one consistent style instead of 55 independent rolls of the dice.
A bad anchor is one bad image to redo; a bad style matched 49 times over is not, and
each call costs real money - the checkpoint exists to spend it once, deliberately,
rather than 55 times on a direction nobody looked at first.

The dragon is an anchor and not just another monster because it is the single most
important picture in the game (the title screen, the turn-8 ending) and the one most
likely to need a second attempt to get right.

## Slot naming and the generated-art directory

`tools/generate-art.ts` reads `everySlot()` straight off `src/ui/art/catalogue.ts` -
the same 55 slots the art room (`ArtRoom.tsx`) already shows a family for uploading
their own pictures over. Nothing here maintains a separate list; add a monster or a
piece of gear to the game and it is a slot here automatically, the same property the
catalogue already had before any of this existed.

Each slot id (e.g. `item:Frying Pan`) becomes a filename via `slotToFilename`
(`src/ui/art/pixelart.ts`, imported by the generator so the two ends can never name a
file differently): colons become hyphens, everything else that is not alphanumeric
becomes an underscore, so `item:Frying Pan` → `item-Frying_Pan.png`. Files live in
`src/ui/art/generated/`, picked up automatically by a Vite `import.meta.glob` - drop a
new PNG in with the right name and it is live with no code change.

## Sound effects

`tools/generate-sfx.ts` is the same shape, reading `src/sfxslots.ts`'s ~14 named
moments into `src/assets/sfx/<key>.mp3` via ElevenLabs' sound-generation endpoint. Each
entry's `prompt` is written with the same "friendly, never harsh" rule the visual
briefs follow - a lost fight gets "a soft, bouncy, comedic failure sound", never
anything that reads as a real failure. See `src/sfxslots.ts` for the full list and the
exact wording sent for each.

## Extending this later

Adding a new monster, a new piece of gear, a new sound: it appears in `everySlot()` /
`everySfx()` on its own (nothing to register), write a one-line visual brief or prompt
only if the bare name would not be enough on its own, then
`npx vite-node tools/generate-art.ts <new slot>` or
`npx vite-node tools/generate-sfx.ts <new key>` - style-matched against the existing
anchors automatically, so a single new piece still looks like it belongs to the set.
