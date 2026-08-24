# Prompt for generating Hex RPG token art

This is a **continuation** prompt: paste it into the same Gemini conversation that
already has the children's drawings and already produced the sticker sheet. It does not
re-describe the style, because Gemini already has it and you already approved it — it
locks it and changes the packaging to one token per image.

Paste **Part 1** once, then work through **Part 2**. Save each result under the exact
filename in **Part 3** and drop them all into this folder.

---

## Part 1 — the continuation prompt (paste once)

> That sticker sheet you made is exactly right — that is the style for the whole game.
> Lock it in: the same coloured-pencil-and-marker look, the same wobbly hand-drawn
> outlines, the same bright palette, the same chunky friendly shapes, the same goofy
> not-scary monsters, and the same faithfulness to the children's original drawings I
> gave you. Every image from here on must look like it came off that same sheet, drawn
> by the same hand on the same afternoon. Do not restyle, do not "improve", do not drift
> toward a cleaner or more polished look as we go.
>
> What changes is only how you deliver them. I need each object as **its own separate
> image**, because they are going into a game one token at a time and I have to cut them
> out programmatically. So for every image from now on:
>
> - **One single object per image.** Never a sheet, never a grid, never two objects.
> - **Square, 1:1, 1024×1024.**
> - **Centred, whole subject in frame** with a clear margin — nothing clipped by the
>   edge. Subject fills roughly 80% of the picture.
> - **Pure flat white (#FFFFFF) background, or transparent.** No paper texture, no
>   scene, no ground line, no cast or drop shadow.
> - **No text of any kind** — no label, no name, no caption, no number, no watermark.
>   The names on the sticker sheet were useful to me but they must not appear now.
> - **No sticker outline, no white die-cut border, no frame, no circle** around the
>   subject. Just the drawing on white.
>
> Those last two are the ones that break my build, so please check each image against
> them before you send it.
>
> I'll list the objects one at a time. Reply "ready" and I'll start.

**If Gemini drifts** — and it will, after fifteen or twenty images — paste this:

> Stop. Compare this against the original sticker sheet: it has drifted. Go back to that
> exact style — rougher pencil, wobblier outline, simpler shapes — and redo the last one.

---

## Part 2 — the 64 objects

Ask for each one as **"Draw: `<description>`"**, then save the image under the filename
in the left column, lowercase, `.png`, into `hex-rpg/reference/art/`. The build looks
tokens up by filename, so a typo means a missing token.

### Player characters — 4

| # | filename | draw |
|---|---|---|
| 1 | `role-knight.png` | A friendly knight in grey armour holding a sword and a blue shield, smiling |
| 2 | `role-rogue.png` | A rogue in a dark blue hooded cloak with a small dagger, grinning cheekily |
| 3 | `role-scout.png` | A scout in a green explorer's outfit holding a brass telescope up to one eye |
| 4 | `role-doctor.png` | A doctor in a white coat with a red-cross medical bag and a wooden staff |

### Monsters, the common ones — 5

| # | filename | draw |
|---|---|---|
| 5 | `mob-blob.png` | A round purple blob monster with two big eyes, a wide grin and four stubby legs |
| 6 | `mob-goblin.png` | A small green goblin with pointy ears, a tuft of hair and a brown tunic, sticking its tongue out |
| 7 | `mob-lizard.png` | A little green-and-blue dragonling on four legs with one small wing and a long tail |
| 8 | `mob-ogre.png` | A big chunky green ogre with heavy shoulders, two tusks and surprised red eyes |
| 9 | `mob-imp.png` | A tiny yellow-green imp with spiky horns and a curly tail, looking very pleased with itself |

### Mid bosses — 4

| # | filename | draw |
|---|---|---|
| 10 | `midboss-scarecrow.png` | A scarecrow with a burlap sack head, a floppy straw hat, a patched pink shirt and straw hands |
| 11 | `midboss-serpent.png` | A long green-and-blue sea serpent with a friendly face, curving through blue water |
| 12 | `midboss-troll.png` | A large grey stone troll with mossy shoulders and a huge grin |
| 13 | `midboss-mushroom.png` | A giant brown mushroom monster with stubby arms, big eyes and a spotted red cap |

### Final boss — 1

| # | filename | draw |
|---|---|---|
| 14 | `boss-dragon.png` | A big red dragon with three heads, orange-yellow belly scales, spread wings and a long tail, mischievous rather than evil |

### Hazards — 4

| # | filename | draw |
|---|---|---|
| 15 | `hazard-tornado.png` | A grey swirling tornado with a small tree and a spotted cow tumbling around inside it, comic and silly |
| 16 | `hazard-pirates.png` | Three cheerful cartoon pirates together: one with a tricorn hat and cutlass, one holding a skull-and-crossbones flag, one carrying a treasure chest |
| 17 | `hazard-robber.png` | A cartoon robber in a black-and-white striped top and a black eye mask, tiptoeing away with a bulging sack of gold coins |
| 18 | `hazard-family.png` | A kind-looking family sitting on a blanket with a loaf of bread and a water bottle, wrapped in a patchwork quilt |

### Gear — 15

| # | filename | draw |
|---|---|---|
| 19 | `gear-wooden-sword.png` | A wooden toy sword with a brown handle |
| 20 | `gear-frying-pan.png` | A black cast-iron frying pan seen from the side |
| 21 | `gear-slingshot.png` | A wooden slingshot with a red rubber band and a small stone |
| 22 | `gear-big-stick.png` | A big knobbly wooden stick, like a branch |
| 23 | `gear-broom.png` | A straw broom with a wooden handle |
| 24 | `gear-pot-helmet.png` | A grey cooking pot worn upside-down as a helmet |
| 25 | `gear-turtle-shell.png` | A green turtle shell with a hexagon pattern |
| 26 | `gear-winter-coat.png` | A blue puffy winter coat with yellow buttons |
| 27 | `gear-cardboard-box.png` | An open cardboard box worn as armour |
| 28 | `gear-oven-mitts.png` | A pair of red quilted oven mitts |
| 29 | `gear-running-shoes.png` | A pair of white running shoes with blue soles and red laces |
| 30 | `gear-rain-boots.png` | A pair of yellow rubber rain boots |
| 31 | `gear-roller-skates.png` | A pair of white roller skates with orange wheels |
| 32 | `gear-bunny-slippers.png` | A pair of pink bunny slippers with ears and little faces |
| 33 | `gear-flippers.png` | A pair of green swimming flippers |

### Food — 23

The first ten are the children's own chits. Tell Gemini to follow those originals
closely rather than reinterpreting them — especially the bone, which they left as a
blue outline and never coloured in.

| # | filename | draw |
|---|---|---|
| 34 | `food-birthday-cake.png` | A slice of pink birthday cake with candles |
| 35 | `food-bone.png` | A dog bone, drawn as a blue outline with no colour filled in |
| 36 | `food-carrot.png` | An orange carrot with green leafy tops |
| 37 | `food-lettuce.png` | A leafy green head of lettuce |
| 38 | `food-strawberry.png` | A red strawberry with black seeds and a green leaf |
| 39 | `food-egg.png` | A sunny-side-up fried egg with an orange yolk |
| 40 | `food-orange.png` | A round orange with a green stalk |
| 41 | `food-milk.png` | A glass bottle of milk with a blue label |
| 42 | `food-popsicle.png` | A purple popsicle on a wooden stick |
| 43 | `food-candy.png` | A wrapped candy with green twisted ends and a purple sweet in the middle |
| 44 | `food-apple-pie.png` | A slice of apple pie with a lattice crust |
| 45 | `food-banana.png` | A yellow banana |
| 46 | `food-cherries.png` | A pair of red cherries on a stem |
| 47 | `food-cookie.png` | A round chocolate-chip cookie |
| 48 | `food-corn.png` | A yellow corn on the cob with a green husk |
| 49 | `food-grilled-cheese.png` | A toasted grilled cheese sandwich cut in half, cheese stretching |
| 50 | `food-honey-jar.png` | A glass jar of golden honey with a honeycomb label |
| 51 | `food-jam-sandwich.png` | A jam sandwich cut into triangles, red jam showing |
| 52 | `food-mushroom.png` | A brown mushroom with a spotted cap |
| 53 | `food-pancakes.png` | A stack of three pancakes with butter and syrup |
| 54 | `food-pretzel.png` | A twisted brown pretzel with salt |
| 55 | `food-watermelon.png` | A triangular slice of watermelon with black seeds |
| 56 | `food-hot-dog.png` | A hot dog in a bun with a zigzag of mustard |

### Terrain tiles — 8

You already drew these on the hex tile sheet. Same eight, one per image. Say this first:

> The next eight are map tiles, like the hexagon tile sheet you drew earlier — keep that
> exact look. Flat top-down view, a regular hexagon with a thick wobbly black hand-drawn
> border, filling the square frame, pure white outside the hexagon. Still no labels.

| # | filename | draw |
|---|---|---|
| 57 | `tile-forest.png` | Hexagon tile: a dense forest of green leafy and pine trees on light green grass |
| 58 | `tile-field.png` | Hexagon tile: a ploughed brown field, drawn as diagonal pencil furrow lines, with a small scarecrow |
| 59 | `tile-city.png` | Hexagon tile: a village of little houses with red and blue roofs, a winding cobble path, green grass |
| 60 | `tile-river.png` | Hexagon tile: a wide blue river winding across pale brown ground |
| 61 | `tile-forest-field.png` | Hexagon tile: green forest on the upper-left half, brown ploughed field on the lower-right half |
| 62 | `tile-city-rail.png` | Hexagon tile: a village of little houses with a black railway track running across it |
| 63 | `tile-field-rail.png` | Hexagon tile: a brown ploughed field with a black railway track across it and a small sheep |
| 64 | `tile-river-rail.png` | Hexagon tile: a blue river crossed by a black railway track on a small wooden bridge |

---

## Notes

- **You already have eighteen of these.** The sticker sheet covers 1–18: the four
  characters, five mobs, scarecrow, sea serpent, dragon, tornado, pirates, robber and
  family. Ask Gemini to re-issue those individually at the new spec rather than
  reinventing them; it should recognise its own work. Same for the eight tiles.
- **Order of value.** Do 1–18 first, tiles 57–64 next, then food and gear. The drawn
  fallbacks for food and gear are the most passable of the current set.
- **Partial is fine.** Anything missing keeps its existing drawn artwork, so send what
  you have and add the rest later.
- **Batches.** One image per request gives the most consistent results. If you'd rather
  do sheets, put four objects on plain white, evenly spaced and well separated, still
  with no labels — I can cut those up.
- Nothing here is a photo of a real person or a real brand; keep everything generic.
