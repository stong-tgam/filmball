import { useState } from "react";
import Board from "./ui/Board";
import ActionBar from "./ui/ActionBar";
import Log from "./ui/Log";
import { ActivePlayerBanner, PartyList } from "./ui/PlayerPanel";
import CombatModal from "./ui/CombatModal";
import { useActivePlayer, useCombatants, useGame, useLegalMoves } from "./game/store";
import { elementsOf } from "./game/setup";
import { ROLES } from "./game/players";
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
  const moveTo = useGame((s) => s.moveTo);
  const endTurn = useGame((s) => s.endTurn);
  const player = useActivePlayer();
  const legalMoves = useLegalMoves();
  const fight = useCombatants();
  const attack = useGame((s) => s.attack);
  const flee = useGame((s) => s.flee);
  const closeCombat = useGame((s) => s.closeCombat);

  const [seedInput, setSeedInput] = useState("");
  const tile = selected ? game.tiles[selected] : null;
  const over = game.phase === "gameOver";

  const composition = tile
    ? elementsOf(tile)
        .map((element) => ({ element, sides: tile.sides.filter((s) => s === element).length }))
        .sort((a, b) => b.sides - a.sides)
    : [];

  const start = () => {
    const parsed = Number.parseInt(seedInput, 10);
    newGame(Number.isFinite(parsed) && seedInput.trim() !== "" ? parsed >>> 0 : undefined);
  };

  /** A tap on a glowing tile moves; a tap anywhere else just looks. */
  const tapTile = (label: string | null) => {
    if (label !== null && legalMoves.has(label)) moveTo(label);
    else select(label);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Hex RPG</h1>
          <span className="version">v0.3 — enemies and fighting</span>
        </div>
        <p className="turn-counter">
          Turn <strong>{game.turn}</strong>
          <span className="of">/{game.turnLimit}</span>
        </p>
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
            New game
          </button>
        </div>
      </header>

      {over ? (
        <div className="banner banner-over">
          <h2>Time is up</h2>
          <p className="banner-blurb">
            Turn {game.turnLimit} was the last one. Start a new game to play again.
          </p>
        </div>
      ) : (
        <ActivePlayerBanner player={player} moves={legalMoves.size} />
      )}

      <main className="stage">
        <Board
          tiles={game.tiles}
          selected={selected}
          legalMoves={legalMoves}
          players={game.players}
          enemies={game.enemies}
          activeId={player.id}
          activeColour={ROLES[player.role].colour}
          onSelect={tapTile}
        />
      </main>

      <aside className="sidebar">
        <ActionBar
          canMove={legalMoves.size > 0}
          moved={player.movedThisTurn}
          onEndTurn={endTurn}
          disabled={over || game.combat !== null}
        />

        <section className="panel">
          <h2>Party</h2>
          <PartyList players={game.players} activeId={player.id} />
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
            </>
          ) : (
            <p className="muted">Tap a quiet tile to look at it.</p>
          )}
        </section>

        <section className="panel panel-log">
          <h2>Log</h2>
          <Log entries={game.log} />
        </section>
      </aside>

      {game.combat && fight && (
        <CombatModal
          combat={game.combat}
          player={fight.player}
          enemy={fight.enemy}
          onAttack={attack}
          onFlee={flee}
          onClose={closeCombat}
        />
      )}
    </div>
  );
}
