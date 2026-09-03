# Prototypes

Standalone HTML mock-ups. **None of this is in the build the family plays**, and none
of it imports from `src/`. They exist so a design argument can be settled by looking at
the thing rather than by describing it, and they are kept because the *reasoning* in
them is worth more than the code.

Open one straight off disk — no build step, no server.

| File | Question it was built to answer |
|---|---|
| `escape-spot.html` | Can "find the secret spot on the map" be a second way to win? |

## `escape-spot.html`

The table asked for two ways to win — kill the dragon, **or** work out where on the map
the escape spot is and stand on it. This mock has the second half: a 37-tile board with
the monsters showing, a rail of clues down the side, tap-to-cross-off marks on the
hexes, and a **Dig here** button that reports how far off you were.

Three things it established, which is the reason it is kept:

- **The map has to be fully visible for this to work at all.** Elimination is the whole
  activity, and you cannot eliminate ground you have not been told exists. Building this
  for real therefore **retires the fog** — `vision.ts`, `sense.ts`, the compass and the
  remembered-map screen all go, and so does the "no bird's-eye view" section of
  `CLAUDE.md`. That is a much bigger change than the feature sounds like, and it is
  the thing to decide before writing a line of it.
- **Generating a *solvable* puzzle is trivial; generating a *good* one is the problem.**
  Pick the answer first and add clues until exactly one hex survives, and it is solvable
  by construction. But the first version narrowed `36 → 6 → 5 → 3 → 1`: one clue did
  eighty per cent of the work and the other three were decoration. What makes a puzzle
  worth solving is the **shape of the narrowing**, so `buildPuzzle` scores by the
  **harshest single cut** — `min(trail[j] / trail[j-1])` — and prefers the gentlest run,
  where every clue roughly halves what is left. It now gets `36 → 30 → 14 → 8 → 3 → 1`.
  - That needed clue shapes that *split* rather than *pick out*: "it is in the northern
    half" and "there is nothing on it but grass" carry the run where "a monster is
    standing on it" collapses it.
- **Five clues is the ceiling, and it is a people constraint, not a maths one.**
  Unconstrained, the scorer happily produces seven — which narrows beautifully and is
  more cards than a ten-year-old can hold in their head. `MAX_CLUES` is the number the
  table can play, and the generator is fenced by it rather than aiming at it.

Not answered here, and the real design problem left: **two win conditions collapse into
one unless the payoffs differ.** If both simply end the game, the party takes whichever
is cheaper and the dragon becomes scenery. The suggestion on the table is that the
escape spot only takes **whoever is standing on it** — so leaving is a real decision
with a cost, and the dragon stays the way everybody gets out together.
