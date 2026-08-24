import { useState } from "react";
import Board from "./ui/Board";
import Compass from "./ui/Compass";
import Notebook from "./ui/Notebook";
import ActionBar from "./ui/ActionBar";
import Log from "./ui/Log";
import { ActivePlayerBanner, PartyList } from "./ui/PlayerPanel";
import CombatModal from "./ui/CombatModal";
import ShopModal from "./ui/ShopModal";
import GameOver from "./ui/GameOver";
import EventCardModal from "./ui/EventCard";
import {
  useActivePlayer,
  useCanDonate,
  useCanHeal,
  useCanPayOff,
  useCanSearch,
  useCanTrade,
  useCombatants,
  useGame,
  useHealTargets,
  useLegalMoves,
} from "./game/store";
import { sellable, stockFor } from "./game/actions";
import { key } from "./game/hex";
import { elementsOf } from "./game/setup";
import { ROLES } from "./game/players";
import { canSee, smellsSmoke } from "./game/vision";
import { sense } from "./game/sense";
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
  const takeLoot = useGame((s) => s.takeLoot);
  const search = useGame((s) => s.search);
  const eat = useGame((s) => s.eat);
  const writeNotes = useGame((s) => s.writeNotes);
  // The overhead board is a grown-up's debug peek, off by default. The game is the
  // first-person view; being able to flip between them is only here so the map idea
  // can be judged against the thing it replaced.
  const [overhead, setOverhead] = useState(false);
  const shopOpen = useGame((s) => s.shopOpen);
  const openShop = useGame((s) => s.openShop);
  const closeShop = useGame((s) => s.closeShop);
  const buy = useGame((s) => s.buy);
  const clearDraw = useGame((s) => s.clearDraw);
  const canSearch = useCanSearch();
  const canTrade = useCanTrade();
  const canDonate = useCanDonate();
  const canHeal = useCanHeal();
  const canPayOff = useCanPayOff();
  const healTargets = useHealTargets();
  const donate = useGame((s) => s.donate);
  const heal = useGame((s) => s.heal);
  const payOff = useGame((s) => s.payOff);
  const sell = useGame((s) => s.sell);

  const [seedInput, setSeedInput] = useState("");
  const tile = selected ? game.tiles[selected] : null;
  // The sidebar must never say more than the board shows, or tapping around the fog
  // becomes a way to read the whole map without walking it.
  const seesSelected = tile ? canSee(player, tile.hex) : false;
  const over = game.phase === "gameOver" || game.ending !== null;

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
          <span className="version">v1.2 — gear, nerve and snakes</span>
        </div>
        <button
          type="button"
          className="peek"
          aria-pressed={overhead}
          title="Grown-up's peek: the overhead board the players are not supposed to have"
          onClick={() => setOverhead((on) => !on)}
        >
          {overhead ? "Back to the ground" : "Peek at the map"}
        </button>
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
          <h2>Game over</h2>
          <p className="banner-blurb">Start a new game to play again.</p>
        </div>
      ) : (
        <ActivePlayerBanner
          player={player}
          moves={legalMoves.size}
          smoke={smellsSmoke(game, player)}
        />
      )}

      <main className="stage">
        {overhead ? (
          <Board
            tiles={game.tiles}
            selected={selected}
            legalMoves={legalMoves}
            players={game.players}
            enemies={game.enemies}
            hazards={game.hazards}
            turn={game.turn}
            activeId={player.id}
            viewer={player}
            activeColour={ROLES[player.role].colour}
            onSelect={tapTile}
          />
        ) : (
          <Compass
            viewer={player}
            tiles={game.tiles}
            turn={game.turn}
            sensed={sense(game, player)}
            legalMoves={legalMoves}
            onMove={moveTo}
          />
        )}
      </main>

      <aside className="sidebar">
        <ActionBar
          canMove={legalMoves.size > 0}
          moved={player.movedThisTurn}
          acted={player.actedThisTurn}
          canSearch={canSearch}
          canTrade={canTrade}
          canDonate={canDonate}
          canHeal={canHeal}
          canPayOff={canPayOff}
          onSearch={search}
          onTrade={openShop}
          onDonate={donate}
          onHeal={() => healTargets[0] && heal(healTargets[0].id)}
          onPayOff={payOff}
          onEndTurn={endTurn}
          disabled={over || game.combat !== null}
        />

        <section className="panel">
          <h2>Party</h2>
          <PartyList players={game.players} activeId={player.id} onEat={eat} />
        </section>

        {overhead && (
        <section className="panel">
          <h2>Tile</h2>
          {tile && !seesSelected ? (
            <p className="muted">
              You cannot see that far. Walk over and look, or ask whoever is closer.
            </p>
          ) : tile ? (
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
        )}

        <section className="panel">
          <h2>Notes</h2>
          <Notebook players={game.players} activeId={player.id} onWrite={writeNotes} />
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
          onTakeLoot={takeLoot}
          onClose={closeCombat}
          ground={game.tiles[key(fight.enemy.hex)]}
        />
      )}

      {game.draw && !game.combat && !game.ending && (
        <EventCardModal draw={game.draw} turn={game.turn} onClose={clearDraw} />
      )}

      {game.ending && (
        <GameOver ending={game.ending} turn={game.turn} onNewGame={() => newGame()} />
      )}

      {shopOpen && !game.combat && (
        <ShopModal
          player={player}
          gear={stockFor(game).gear}
          food={stockFor(game).food}
          sellable={sellable(player)}
          onBuy={buy}
          onSell={sell}
          onClose={closeShop}
        />
      )}
    </div>
  );
}
