# Art direction — the crayon box

Derived from photographs of the hand-made set: marker on chipboard discs (food and
character chits) and coloured pencil on cream paper (hex tiles, character stickers).

**Nothing here is invented.** Every colour appears in the artwork. Colours were matched
by eye from the photographs, not sampled — the image files were not saved to disk. If
the originals turn up as files, resample and correct.

The visual version of this document, with live tokens and the type specimens, is the
"Crayon Box" artifact. This file is the machine-readable half.

## Ground and ink

| Token | Hex | What it is |
|---|---|---|
| Sketch paper | `#F0E7D6` | The sheet the tiles and stickers lie on. The app's ground. |
| Chipboard | `#FBF7EE` | The blank discs. Warmer than white, lighter than the paper. |
| Charcoal | `#23201C` | Every hex border. Never pure black. |
| Label navy | `#1F3A6E` | Their own printed tile captions. The interface's structural colour. |

## The eight markers

Artwork only. Never interface chrome.

| Name | Hex | Where it came from |
|---|---|---|
| Strawberry | `#DC2F2A` | Strawberry, city roofs, the doctor's cross, handwritten labels |
| Cake pink | `#E0407E` | The birthday cake. Rarest colour in the box |
| Carrot | `#F0821E` | Carrot, orange, egg yolk |
| Sunshine | `#F2B705` | Cottage walls, dragon's belly, treasure |
| Leaf | `#45A63F` | Lettuce, carrot tops, candy wrapper, every tree |
| River | `#1E6FD9` | River band, milk label, cottage roofs |
| Grape | `#7B2FA0` | Popsicle, the sweet in the wrapper, the purple mob |
| Cocoa | `#7A4A22` | Tree trunks, field furrows, popsicle stick, egg outline |

Leaf and cocoa carry the whole board, so the food colours must fight them for
attention. That is why strawberry sits cooler than a fire-engine red.

## Type

| Role | Face | Rule |
|---|---|---|
| Display | Gloria Hallelujah | Headings and the game's name only. Never below 18px. |
| Token labels | Patrick Hand | Every item name, tile caption, card title. Legible to 12px. |
| Interface and numbers | Nunito, tabular figures | All health, money, dice totals, turn counter. |

Fallback stacks must include `"Comic Sans MS", "Chalkboard SE", cursive` — it is on
almost every machine and it is the right shape for this subject.

**Numbers are never handwritten.** Names are hand-lettered; quantities are printed.

## Building a token

1. **The line is never black.** Outlines take a darkened version of their own fill.
   Charcoal is for hex borders, seeds, eyes and dots only.
2. **The fill misses the line.** Offset the fill 1–2px from the outline so it overshoots
   one edge and leaves bare card at the other.
3. **Two or three marks of detail, then stop.** Two furrows on the carrot. Seven seeds
   on the strawberry.
4. **Nothing is centred or straight.** Labels tilt 1–3°. Seed the wobble from the item's
   name so it is stable between renders.
5. **Recognisable before beautiful.** Under a second to identify from across the table.

**Keep two or three items uncoloured.** The photographed bone is a blue outline on bare
card next to nine filled chits. That is the clearest signal a person made the set.

## The SVG recipe

```svg
<filter id="wobble" x="-12%" y="-12%" width="124%" height="124%">
  <feTurbulence type="fractalNoise" baseFrequency="0.021"
                numOctaves="3" seed="7" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="3.4"
                     xChannelSelector="R" yChannelSelector="G"/>
</filter>
```

| Dial | Setting | Why |
|---|---|---|
| `scale` | 3–4 | At a 100-unit viewBox. Above 5 shapes stop reading; below 2 it looks like a printing fault. |
| `baseFrequency` | 0.02 | Long lazy waves — a wrist, not a tremor. |
| `seed` | per item | Hash the item name. |
| Stroke width | 2.4 | ~2.5% of token width, so it scales as one unit. |
| Stroke caps | round | Fibre tips make no sharp corners. |
| Fill opacity | 0.92 | Marker on card is never fully opaque. |

`feTurbulence` is not free. Apply the filter to a whole group, not per path; 61 tiles
each running their own filter will cost frames on a tablet. Tiles can bake the wobble
into path data at generation time if it bites.

## Tiles are a different object

| | Chits and tokens | Hex tiles |
|---|---|---|
| Medium | Fibre-tip marker | Coloured pencil, marker border |
| Ground | Chipboard `#FBF7EE` | Cream paper `#F0E7D6` |
| Outline | Darkened fill colour, 2.4px | Charcoal, heavy and textured, 5px |
| Fill | Flat, opaque, edge to edge | Directional hatching |
| Label | Handwritten inside the disc | Printed navy, outside the tile |

Field tiles are **hatched in cocoa at two angles**, not filled — the change of angle is
what makes one field read as a different field. Grass is short green flicks. That
directional stroke is what the current flat-vector tiles are missing.

## Not yet decided — ask before building

1. **Marker or pencil for tokens?** Assumed marker for chits, pencil for tiles, matching
   the source. One medium throughout would be more consistent and less faithful.
2. **Do the children's own drawings go in the game?** Scanned PNGs would beat anything
   generated.
3. **Whole-app theme, or board only?** The shell is currently dark slate and at odds
   with this; re-skinning it is roughly a day on top of the tokens.
4. **Names on tokens?** The photographed chits are all lettered, but at token size on a
   tablet the label costs half the drawing.
