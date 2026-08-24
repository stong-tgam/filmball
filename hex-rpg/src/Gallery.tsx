/**
 * The monster sheet: every drawing in the game, on the paper theme, with the backs
 * turned over and the upload control live.
 *
 * This doubles as the first look at the whole-app theme — cream paper, card panels,
 * handwritten labels — before the game's own shell is rebuilt on it.
 */

import CrayonDefs from "./ui/art/CrayonDefs";
import MonsterArt, { MOB_ART, MOB_NAMES } from "./ui/art/monsters";
import FeatureArt, { FEATURE_BLURB } from "./ui/art/features";
import ItemArt from "./ui/art/items";
import TerrainArt from "./ui/art/terrain";
import { EQUIPMENT, FOOD } from "./game/items";
import Token from "./ui/Token";
import UploadArt from "./ui/art/UploadArt";
import { MARKER } from "./ui/art/crayon";
import { ENEMIES } from "./game/enemies";
import type { Element, Feature, Tile } from "./game/types";
import "./styles.css";
import "./gallery.css";

const FEATURES: Feature[] = ["water", "railway", "city", "forest", "field"];

const SLOT_WORD: Record<string, string> = {
  weapon: "attack",
  armor: "health",
  boots: "movement",
  supply: "health",
};

/** The ten chits the children actually made. */
const ORIGINALS = [
  "Birthday Cake", "Bone", "Carrot", "Lettuce", "Strawberry",
  "Sunny Side Up Egg", "Orange", "Milk", "Popsicle", "Candy",
];

function FoodBack({ name }: { name: string }) {
  const food = FOOD.find((f) => f.name === name);
  if (!food) return null;
  if (food.name === "Bone") {
    return (
      <>
        <strong>No use as food</strong>
        Sells for $1. A thief takes this and nothing else.
      </>
    );
  }
  return (
    <>
      <strong>+{food.value} health</strong>
      $1 in any city. Eat it whenever you like.
    </>
  );
}

/** Sample tiles, matching the eight on the children's own tile sheet. */
const side = (...elements: Element[]): Element[] => elements;
const makeTile = (base: Tile["base"], sides: Element[], extra: Partial<Tile> = {}): Tile => ({
  hex: { q: 0, r: 0 },
  base,
  sides,
  river: sides.includes("water"),
  rail: false,
  destroyedUntil: null,
  searched: false,
  ...extra,
});

const TILES: { name: string; tile: Tile }[] = [
  { name: "Forest", tile: makeTile("forest", side("forest", "forest", "forest", "forest", "forest", "forest")) },
  { name: "Field", tile: makeTile("field", side("field", "field", "field", "field", "field", "field")) },
  { name: "City", tile: makeTile("city", side("city", "city", "city", "city", "city", "city")) },
  { name: "River", tile: makeTile("field", side("water", "field", "field", "water", "field", "field")) },
  { name: "Forest edge", tile: makeTile("field", side("forest", "forest", "field", "field", "field", "forest")) },
  { name: "City & rail", tile: makeTile("city", side("city", "city", "city", "city", "city", "city"), { rail: true }) },
  { name: "Field & rail", tile: makeTile("field", side("field", "field", "field", "field", "field", "field"), { rail: true }) },
  { name: "River crossing", tile: makeTile("field", side("water", "field", "field", "water", "field", "field"), { rail: true }) },
];

function MonsterBack({ kind }: { kind: keyof typeof ENEMIES }) {
  const beast = ENEMIES[kind];
  return (
    <>
      <strong>
        {beast.health[0]}–{beast.health[1]} health
      </strong>
      {beast.blurb}
    </>
  );
}

export default function Gallery() {
  return (
    <div className="sheet-page">
      <CrayonDefs />

      <header className="sheet-head">
        <h1>The monster sheet</h1>
        <p>
          Every drawing in the game. Tap one to turn it over — the back is what the
          rulebook says about it. Any picture here can be swapped for one of yours.
        </p>
      </header>

      <section>
        <h2 style={{ ["--pencil" as string]: MARKER.leaf }}>Bandits</h2>
        <p className="note">
          Fifteen of them walk the board and they share these five faces. Which face a
          bandit gets comes from its id, so it keeps the same one all game.
        </p>
        <div className="row">
          {MOB_NAMES.map((name) => {
            const Art = MOB_ART[name];
            return (
              <figure key={name} className="cell">
                <Token
                  slot={`monster:mob:${name}`}
                  label={name}
                  size={116}
                  back={<MonsterBack kind="mob" />}
                >
                  <Art seedName={name} />
                </Token>
                <figcaption>
                  <UploadArt slot={`monster:mob:${name}`} label={name} />
                </figcaption>
              </figure>
            );
          })}
        </div>
      </section>

      <section>
        <h2 style={{ ["--pencil" as string]: MARKER.cake }}>Ogres</h2>
        <p className="note">
          Four on the board, two drawings. Both are on the children's own sheet — the
          scarecrow and the thing in the river.
        </p>
        <div className="row">
          {(["Scarecrow", "SeaSerpent"] as const).map((name) => (
            <figure key={name} className="cell">
              <Token
                slot={`monster:midboss:${name}`}
                label={name === "SeaSerpent" ? "River Beast" : "Scarecrow"}
                size={132}
                back={<MonsterBack kind="midboss" />}
              >
                <MonsterArt kind="midboss" seedName={name === "Scarecrow" ? "midboss-1" : "midboss-2"} />
              </Token>
              <figcaption>
                <UploadArt slot={`monster:midboss:${name}`} label="ogre" />
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ ["--pencil" as string]: MARKER.strawberry }}>The dragon</h2>
        <p className="note">
          One of these, in the middle of the board, and killing it is the whole game.
          Drawn biggest, with two heads, so nobody mistakes it for anything else.
        </p>
        <div className="row">
          <figure className="cell">
            <Token
              slot="monster:finalboss"
              label="Dragon"
              size={164}
              back={<MonsterBack kind="finalboss" />}
            >
              <MonsterArt kind="finalboss" seedName="finalboss-1" />
            </Token>
            <figcaption>
              <UploadArt slot="monster:finalboss" label="dragon" />
            </figcaption>
          </figure>
        </div>
      </section>

      <section>
        <h2 style={{ ["--pencil" as string]: MARKER.cocoa }}>The thieves</h2>
        <p className="note">
          They wander the board like the weather does, but they fight like ogres — and
          they are carrying whatever they have taken off you.
        </p>
        <div className="row">
          {(["robber", "pirates"] as const).map((kind) => (
            <figure key={kind} className="cell">
              <Token
                slot={`monster:${kind}`}
                label={ENEMIES[kind].name}
                size={132}
                back={<MonsterBack kind={kind} />}
              >
                <MonsterArt kind={kind} seedName={`${kind}-1`} />
              </Token>
              <figcaption>
                <UploadArt slot={`monster:${kind}`} label={ENEMIES[kind].name} />
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ ["--pencil" as string]: MARKER.river }}>Boss features</h2>
        <p className="note">
          Every monster draws one of these when you first meet it, and the dragon draws
          two. A feature is ground it is at home on — so each card is a scrap of that
          ground rather than a symbol for it.
        </p>
        <div className="row">
          {FEATURES.map((feature) => (
            <figure key={feature} className="cell">
              <Token
                slot={`feature:${feature}`}
                label={feature}
                size={116}
                labelColour={MARKER.river}
                back={<>{FEATURE_BLURB[feature]}</>}
              >
                <FeatureArt feature={feature} />
              </Token>
              <figcaption>
                <UploadArt slot={`feature:${feature}`} label={feature} />
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ ["--pencil" as string]: MARKER.cocoa }}>Gear</h2>
        <p className="note">
          Fifteen pieces, and that is every one that exists in a game. All of it is
          named after something out of a kitchen or a hallway, which is the rulebook's
          joke: you go at a dragon with a frying pan and a pair of bunny slippers.
        </p>
        <div className="row">
          {EQUIPMENT.map((item) => (
            <figure key={item.name} className="cell">
              <Token
                slot={`item:${item.name}`}
                label={item.name}
                size={104}
                labelColour={MARKER.cocoa}
                back={
                  <>
                    <strong>+{item.value} {SLOT_WORD[item.slot]}</strong>
                    ${item.cost} to buy or sell
                  </>
                }
              >
                <ItemArt name={item.name} />
              </Token>
            </figure>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ ["--pencil" as string]: MARKER.cake }}>Food they drew</h2>
        <p className="note">
          These ten are copies of chits the children actually made. The bone is drawn
          and never coloured in, exactly as it is on the table — it is worth nothing to
          eat, sells for a dollar, and a thief will take it and leave everything else.
        </p>
        <div className="row">
          {ORIGINALS.map((name) => (
            <figure key={name} className="cell">
              <Token
                slot={`item:${name}`}
                label={name}
                size={104}
                back={<FoodBack name={name} />}
              >
                <ItemArt name={name} />
              </Token>
            </figure>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ ["--pencil" as string]: MARKER.sunshine }}>The rest of the larder</h2>
        <p className="note">Everything else on the supply list. All of it heals one.</p>
        <div className="row">
          {FOOD.filter((f) => !ORIGINALS.includes(f.name)).map((item) => (
            <figure key={item.name} className="cell">
              <Token
                slot={`item:${item.name}`}
                label={item.name}
                size={92}
                back={<FoodBack name={item.name} />}
              >
                <ItemArt name={item.name} />
              </Token>
            </figure>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ ["--pencil" as string]: MARKER.leaf }}>The ground</h2>
        <p className="note">
          Tiles are coloured pencil rather than marker, and pencil shows its direction:
          fields are ploughed instead of filled, grass is flicks instead of a wash. Two
          fields side by side get their furrows at different angles, which is what stops
          a run of them reading as one big field.
        </p>
        <div className="row row-tiles">
          {TILES.map(({ name, tile }) => (
            <figure key={name} className="cell">
              <svg width="132" height="132" viewBox="-56 -56 112 112" role="img" aria-label={name}>
                <TerrainArt tile={tile} size={48} label={name} clipId={`clip-${name.replace(/\W/g, "")}`} />
              </svg>
              <figcaption className="tile-name">{name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <footer className="sheet-foot">
        <p>
          Drawings you upload are kept on this device only, shrunk to 320px. Nothing is
          sent anywhere. Clearing the browser's site data clears them.
        </p>
      </footer>
    </div>
  );
}
