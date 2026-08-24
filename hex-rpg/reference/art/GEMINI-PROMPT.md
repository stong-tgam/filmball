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

## Part 2 — the objects

Ask for each one as: **"Draw: `<description>`"**

### Player characters (4)
1. A friendly knight in grey armour holding a sword and a blue shield, smiling
2. A rogue in a dark blue hooded cloak with a small dagger, grinning cheekily
3. A scout in a green explorer's outfit holding a brass telescope up to one eye
4. A doctor in a white coat with a red-cross medical bag and a wooden staff

### Monsters — the common ones (5)
5. A round purple blob monster with two big eyes, a wide grin and four stubby legs
6. A small green goblin with pointy ears, a tuft of hair and a brown tunic, sticking its tongue out
7. A little green-and-blue dragonling on four legs with one small wing and a long tail
8. A big chunky green ogre with heavy shoulders, two tusks and surprised red eyes
9. A tiny yellow-green imp with spiky horns and a curly tail, looking very pleased with itself

### Monsters — the mid bosses (4)
10. A scarecrow with a burlap sack head, a floppy straw hat, a patched pink shirt and straw hands
11. A long green-and-blue sea serpent with a friendly face, curving through blue water
12. A large grey stone troll with mossy shoulders and a huge grin
13. A giant brown mushroom monster with stubby arms, big eyes and a spotted red cap

### Final boss (1)
14. A big red dragon with three heads, orange-yellow belly scales, spread wings and a long tail, looking mischievous rather than evil

### Hazards (4)
15. A grey swirling tornado with a small tree and a spotted cow tumbling around inside it, comic and silly
16. Three cheerful cartoon pirates standing together: one with a tricorn hat and cutlass, one holding a skull-and-crossbones flag, one carrying a treasure chest
17. A cartoon robber in a black-and-white striped top and a black eye mask, tiptoeing away with a bulging sack of gold coins
18. A kind-looking family sitting on a blanket with a loaf of bread and a water bottle, wrapped in a patchwork quilt

### Gear (15)
19. A wooden toy sword with a brown handle
20. A black cast-iron frying pan seen from the side
21. A wooden slingshot with a red rubber band and a small stone
22. A big knobbly wooden stick, like a branch
23. A straw broom with a wooden handle
24. A grey cooking pot worn upside-down as a helmet
25. A green turtle shell with a hexagon pattern
26. A blue puffy winter coat with yellow buttons
27. An open cardboard box worn as armour
28. A pair of red quilted oven mitts
29. A pair of white running shoes with blue soles and red laces
30. A pair of yellow rubber rain boots
31. A pair of white roller skates with orange wheels
32. A pair of pink bunny slippers with ears and little faces
33. A pair of green swimming flippers

### Food (23)
34. A slice of pink birthday cake with candles
35. A dog bone, drawn as a blue outline with no colour filled in
36. An orange carrot with green leafy tops
37. A leafy green head of lettuce
38. A red strawberry with black seeds and a green leaf
39. A sunny-side-up fried egg with an orange yolk
40. A round orange with a green stalk
41. A glass bottle of milk with a blue label
42. A purple popsicle on a wooden stick
43. A wrapped candy with green twisted ends and a purple sweet in the middle
44. A slice of apple pie with a lattice crust
45. A yellow banana
46. A pair of red cherries on a stem
47. A round chocolate-chip cookie
48. A yellow corn on the cob with a green husk
49. A toasted grilled cheese sandwich cut in half, cheese stretching
50. A glass jar of golden honey with a honeycomb label
51. A jam sandwich cut into triangles, red jam showing
52. A brown mushroom with a spotted cap
53. A stack of three pancakes with butter and syrup
54. A twisted brown pretzel with salt
55. A triangular slice of watermelon with black seeds
56. A hot dog in a bun with a zigzag of mustard

### Terrain tiles (8) — these ones are DIFFERENT
You already drew these on the hex tile sheet. Same eight, one per image. Say this first:
> The next eight are map tiles, like the hexagon tile sheet you drew earlier — keep that
> exact look. Flat top-down view, a regular hexagon with a thick wobbly black hand-drawn
> border, filling the square frame, pure white outside the hexagon. Still no labels.

57. Hexagon tile: a dense forest of green leafy and pine trees on light green grass
58. Hexagon tile: a ploughed brown field, drawn as diagonal pencil furrow lines, with a small scarecrow
59. Hexagon tile: a village of little houses with red and blue roofs, a winding cobble path, green grass
60. Hexagon tile: a wide blue river winding across pale brown ground
61. Hexagon tile: green forest on the upper-left half, brown ploughed field on the lower-right half
62. Hexagon tile: a village of little houses with a black railway track running across it
63. Hexagon tile: a brown ploughed field with a black railway track across it and a small sheep
64. Hexagon tile: a blue river crossed by a black railway track on a small wooden bridge

---

## Part 3 — filenames

Save every image into `hex-rpg/reference/art/` using **exactly** these names, lowercase,
`.png`. The build looks them up by name, so a typo means a missing token.

```
role-knight        role-rogue          role-scout           role-doctor
mob-blob           mob-goblin          mob-lizard           mob-ogre            mob-imp
midboss-scarecrow  midboss-serpent     midboss-troll        midboss-mushroom
boss-dragon
hazard-tornado     hazard-pirates      hazard-robber        hazard-family
gear-wooden-sword  gear-frying-pan     gear-slingshot       gear-big-stick      gear-broom
gear-pot-helmet    gear-turtle-shell   gear-winter-coat     gear-cardboard-box  gear-oven-mitts
gear-running-shoes gear-rain-boots     gear-roller-skates   gear-bunny-slippers gear-flippers
food-birthday-cake food-bone           food-carrot          food-lettuce        food-strawberry
food-egg           food-orange         food-milk            food-popsicle       food-candy
food-apple-pie     food-banana         food-cherries        food-cookie         food-corn
food-grilled-cheese food-honey-jar     food-jam-sandwich    food-mushroom       food-pancakes
food-pretzel       food-watermelon     food-hot-dog
tile-forest        tile-field          tile-city            tile-river
tile-forest-field  tile-city-rail      tile-field-rail      tile-river-rail
```

## Notes

- **You already have some of these.** The sticker sheet covers the four characters, five
  mobs, the scarecrow, the sea serpent, the dragon, the tornado, the pirates, the robber
  and the family — eighteen of the sixty-four. Ask Gemini to re-issue those individually
  at the new spec rather than reinventing them; it should recognise its own work. Same
  for the eight hex tiles.
- **Order of value.** Characters, monsters, bosses and hazards first (1–18). Tiles next
  (57–64). Food and gear last — the current drawn versions of those are the most
  passable, and the children already drew ten of the foods themselves.
- **Partial is fine.** Anything missing keeps its existing drawn artwork, so send what
  you have and add more later.
- **Batches.** One image per request gives the most consistent results. If you'd rather
  do sheets, put four objects on a plain white background, evenly spaced, well separated,
  and still with no labels — I can cut those up.
- Nothing here is a photo of a real person or a real brand; keep everything generic.
