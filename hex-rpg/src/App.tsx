import { useState } from "react";
import Board from "./ui/Board";
import { useGame } from "./game/store";
import { countTerrain, elementsOf, TILE_COUNT } from "./game/setup";
import "./styles.css";

const TERRAIN_BLURB: Record<string, string> = {
  field: "Open ground. Searchable.",
  forest: "Cover and foraging. Searchable.",
  city: "Trade here: food, and whatever gear is still in the pile.",
};

const ELEMENT_NAME: Record<string, string> = {
  field: "Field",
  forest: "Forest",
  city: "City",
  water: "Water",
};

export default function App() {
  const game = useGame((s) => s.game);
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  const newGame = useGame((s) => s.newGame);

  const [seedInput, setSeedInput] = useState("");
  const counts = countTerrain(game.tiles);
  const tile = selected ? game.tiles[selected] : null;
  const mixed = Object.values(game.tiles).filter((t) => elementsOf(t).length > 1).length;

  // What the selected tile is made of: each element it holds, and how many of its
  // six sides that element owns.
  const composition = tile
    ? elementsOf(tile)
        .map((element) => ({ element, sides: tile.sides.filter((s) => s === element).length }))
        .sort((a, b) => b.sides - a.sides)
    : [];

  const start = () => {
    const parsed = Number.parseInt(seedInput, 10);
    newGame(Number.isFinite(parsed) && seedInput.trim() !== "" ? parsed >>> 0 : undefined);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Hex RPG</h1>
          <span className="version">v0.1 — the board</span>
        </div>
        <div className="seedbar">
          <label htmlFor="seed">Seed</label>
          <input
            id="seed"
            inputMode="numeric"
            placeholder={String(game.seed)}
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
          />
          <button type="button" onClick={start}>
            New board
          </button>
        </div>
      </header>

      <main className="stage">
        <Board tiles={game.tiles} selected={selected} onSelect={select} />
      </main>

      <aside className="sidebar">
        <section className="panel">
          <h2>Board</h2>
          <dl className="stats">
            <div><dt>Seed</dt><dd className="mono">{game.seed}</dd></div>
            <div><dt>Tiles</dt><dd>{Object.keys(game.tiles).length} / {TILE_COUNT}</dd></div>
            <div><dt>Fields</dt><dd>{counts.field}</dd></div>
            <div><dt>Forest</dt><dd>{counts.forest}</dd></div>
            <div><dt>Cities</dt><dd>{counts.city}</dd></div>
            <div><dt>River</dt><dd>{counts.river} tiles</dd></div>
            <div><dt>Railway</dt><dd>{counts.rail} tiles</dd></div>
            <div><dt>Mixed tiles</dt><dd>{mixed}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <h2>Tile</h2>
          {tile ? (
            <>
              <p className="tile-name">
                <span className="mono">{selected}</span> — {tile.base}
              </p>
              <p className="muted">{TERRAIN_BLURB[tile.base]}</p>
              <ul className="tags">
                {composition.map(({ element, sides }) => (
                  <li key={element} className={`tag tag-${element}`}>
                    {ELEMENT_NAME[element]}
                    <span className="tag-count">{sides}</span>
                  </li>
                ))}
                {tile.rail && <li className="tag tag-rail">Railway</li>}
              </ul>
              <p className="muted small">
                {composition.length === 1
                  ? "One element, all six sides."
                  : `${composition.length} elements, by the sides each one holds.`}
              </p>
              <p className="muted mono small">
                axial q={tile.hex.q}, r={tile.hex.r}
              </p>
            </>
          ) : (
            <p className="muted">Tap a tile to inspect it.</p>
          )}
        </section>

        <section className="panel">
          <h2>Next up</h2>
          <p className="muted">
            v0.2 puts four players on this board and lets them move. Nothing is placed
            yet — this build is the map only.
          </p>
        </section>
      </aside>
    </div>
  );
}
