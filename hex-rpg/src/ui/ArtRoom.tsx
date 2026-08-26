/**
 * The art room: every picture in the game, and a way to replace each one.
 *
 * There was already a per-picture upload control and a store to keep them in, but the
 * only screen that used them was the separate monster-sheet page - which is a second
 * HTML entry point and therefore **does not exist in the build the family actually
 * plays**. So the feature was real and unreachable. This is the same machinery with a
 * door on it, inside the app, reachable from the title screen.
 *
 * What a picture is worth knowing about it:
 *
 * - It is **shrunk to `MAX_EDGE` and squared off** on the way in (`prepareDrawing`), so
 *   a phone photograph does not eat the whole storage budget. Forty-odd drawings at
 *   that size fit comfortably.
 * - It lives in **this browser, on this device**. It survives the game being rebuilt -
 *   the store is keyed to the page, not to the version - but not a cleared cache and
 *   not a different tablet. That is what **Save them to a file** is for.
 * - It wins **everywhere the picture appears** (`art/Art.tsx`), not just on one card.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import CrayonDefs from "./art/CrayonDefs";
import Art from "./art/Art";
import ItemArt from "./art/items";
import MonsterArt from "./art/monsters";
import FeatureArt from "./art/features";
import GemArt from "./art/gems";
import RoleArt from "./art/roles";
import { shelves, type ArtEntry } from "./art/catalogue";
import {
  MAX_EDGE,
  clearAllOverrides,
  clearOverride,
  drawnCount,
  exportDrawings,
  importDrawings,
  overrideFor,
  prepareDrawing,
  putOverride,
  storageUsed,
  subscribe,
} from "./art/overrides";
import { everySlot } from "./art/catalogue";
import { readyToSave, saveTextFile } from "./art/downloads";
import type { EnemyKind, Feature, GemKind, Role } from "../game/types";

/** The generated drawing for a slot, so every square shows what it is replacing. */
function Drawn({ slot }: { slot: string }) {
  const [what, rest] = [slot.slice(0, slot.indexOf(":")), slot.slice(slot.indexOf(":") + 1)];
  switch (what) {
    case "role":
      return <RoleArt role={rest as Role} />;
    case "monster":
      return <MonsterArt kind={rest as EnemyKind} seedName={slot} />;
    case "gem":
      return <GemArt kind={rest as GemKind} />;
    case "feature":
      return <FeatureArt feature={rest as Feature} seedName={slot} />;
    default:
      return <ItemArt name={rest} seedName={slot} />;
  }
}

function Square({ entry }: { entry: ArtEntry }) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const mine = useSyncExternalStore(subscribe, () => overrideFor(entry.slot), () => undefined);

  const take = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    try {
      const kept = putOverride(entry.slot, await prepareDrawing(file));
      if (!kept) setProblem("Showing now, but this device has no room to keep it.");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That picture would not open.");
    }
  };

  return (
    <li className={`art-square${mine ? " is-mine" : ""}`}>
      <svg viewBox="0 0 100 100" className="art-pic" aria-hidden="true">
        <Art slot={entry.slot}>
          <Drawn slot={entry.slot} />
        </Art>
      </svg>

      <div className="art-said">
        <p className="art-name">{entry.name}</p>
        <p className="art-hint">{entry.hint}</p>
      </div>

      <div className="art-buttons">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="upload-input"
          onChange={(e) => {
            void take(e.target.files?.[0]);
            // Let the same file be chosen twice - a child who crops and re-saves the
            // photo would otherwise find the button does nothing the second time.
            e.target.value = "";
          }}
        />
        <button type="button" onClick={() => input.current?.click()}>
          {mine ? "Change it" : "Use my drawing"}
        </button>
        {mine && (
          <button type="button" className="ghost" onClick={() => clearOverride(entry.slot)}>
            Put it back
          </button>
        )}
      </div>

      {problem && <p className="art-problem">{problem}</p>}
    </li>
  );
}

export default function ArtRoom({ onClose }: { onClose: () => void }) {
  const drawn = useSyncExternalStore(subscribe, drawnCount, () => 0);
  const used = useSyncExternalStore(subscribe, storageUsed, () => 0);
  const total = everySlot().length;
  const bringIn = useRef<HTMLInputElement>(null);
  const [said, setSaid] = useState<string | null>(null);
  // Two taps rather than `confirm()`: a page inside a sandboxed frame - which is how
  // this gets played most of the time - is not allowed to open a modal at all, and the
  // call returns false without asking. A button that quietly did nothing would be
  // worse than one that asks in the page.
  const [sure, setSure] = useState(false);

  // Ask the host up front whether it will save files for us: the answer can take ten
  // seconds when nothing is listening, and that wait belongs here rather than after
  // somebody has tapped the button. See `art/downloads.ts`.
  useEffect(() => void readyToSave(), []);

  const save = async () => {
    setSaid("Saving…");
    setSaid((await saveTextFile("hex-rpg-drawings.json", exportDrawings())).message);
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    const result = importDrawings(await file.text());
    setSaid(
      "error" in result
        ? result.error
        : result.kept
        ? `${result.added} drawing${result.added === 1 ? "" : "s"} brought in.`
        : `${result.added} brought in, but this device has no room to keep them.`,
    );
  };

  return (
    <div className="artroom">
      <CrayonDefs />

      <header className="artroom-top">
        <div>
          <h1>Our drawings</h1>
          <p className="artroom-count">
            <strong>{drawn}</strong> of {total} replaced · {Math.round(used / 1024)} KB used
          </p>
        </div>
        <button type="button" className="artroom-back" onClick={onClose}>
          Back to the game
        </button>
      </header>

      <p className="artroom-blurb">
        Every picture in the game is here. Take a photo of one you have drawn on paper
        and it replaces the one we made — on the board, in the fight, in the shop and in
        the pack, all at once. Pictures are squared off and shrunk to {MAX_EDGE} pixels,
        so photograph the drawing straight on with a bit of space round it.
      </p>

      <div className="artroom-file">
        <button type="button" onClick={() => void save()} disabled={drawn === 0}>
          Save them to a file
        </button>
        <input
          ref={bringIn}
          type="file"
          accept="application/json,.json"
          className="upload-input"
          onChange={(e) => {
            void load(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button type="button" className="ghost" onClick={() => bringIn.current?.click()}>
          Bring some in
        </button>
        {drawn > 0 && (
          <button
            type="button"
            className={`ghost${sure ? " art-sure" : ""}`}
            onClick={() => {
              if (!sure) return setSure(true);
              clearAllOverrides();
              setSure(false);
              setSaid("All the pictures are back to the ones we drew.");
            }}
            onBlur={() => setSure(false)}
          >
            {sure ? `Really — put all ${drawn} back?` : "Put them all back"}
          </button>
        )}
        <p className="artroom-note">
          The drawings live in this browser. Saving them to a file is how they get onto
          another tablet — or back to whoever is building the game, to be put in for good.
        </p>
        {said && <p className="artroom-said">{said}</p>}
      </div>

      {shelves().map((shelf) => (
        <section key={shelf.title} className="artroom-shelf">
          <h2>{shelf.title}</h2>
          <p className="artroom-shelf-blurb">{shelf.blurb}</p>
          <ul className="art-grid">
            {shelf.entries.map((entry) => (
              <Square key={entry.slot} entry={entry} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
