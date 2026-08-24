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
import Token from "./ui/Token";
import UploadArt from "./ui/art/UploadArt";
import { MARKER } from "./ui/art/crayon";
import { ENEMIES } from "./game/enemies";
import type { Feature } from "./game/types";
import "./styles.css";
import "./gallery.css";

const FEATURES: Feature[] = ["water", "railway", "city", "forest", "field"];

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

      <footer className="sheet-foot">
        <p>
          Drawings you upload are kept on this device only, shrunk to 320px. Nothing is
          sent anywhere. Clearing the browser's site data clears them.
        </p>
      </footer>
    </div>
  );
}
