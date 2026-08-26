import { useState } from "react";
import Board from "./ui/Board";
import Compass from "./ui/Compass";
import CrayonDefs from "./ui/art/CrayonDefs";
import ActionBar from "./ui/ActionBar";
import Log from "./ui/Log";
import { ActivePlayerBanner, PartyList } from "./ui/PlayerPanel";
import GemBar from "./ui/GemBar";
import ArtRoom from "./ui/ArtRoom";
import CombatModal from "./ui/CombatModal";
import ShopModal from "./ui/ShopModal";
import GameOver from "./ui/GameOver";
import EventCardModal from "./ui/EventCard";
import FindCard from "./ui/FindCard";
import HookModal from "./ui/HookModal";
import GiveModal from "./ui/GiveModal";
import TitleScreen from "./ui/TitleScreen";
import { readSave } from "./game/save";
import type { Role } from "./game/types";
import {
  useActivePlayer,
  useCanDonate,
  useCanHeal,
  useCanFightThief,
  useCanSetGem,
  useCanSwingTwice,
  useCanPayOff,
  useThiefHere,
  useCanFish,
  useCanGive,
  useFighters,
  useInviteTargets,
  useSupportChoices,
  useCanHook,
  useCanSearch,
  useGiveTargets,
  useHookTargets,
  useCanTrade,
  useCombatants,
  useGame,
  useHealTargets,
  useLegalMoves,
} from "./game/store";
import { sellable, stockFor } from "./game/actions";
import { key } from "./game/hex";
import { elementsOf } from "./game/setup";
import { ROLES, hasMoved } from "./game/players";
import { canSee, smellsSmoke } from "./game/vision";
import { doomed, rimWarning } from "./game/collapse";
import { sense } from "./game/sense";
import { searchKind } from "./game/actions";
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
  const resume = useGame((s) => s.resume);
  // Read the shelf once, on mount: `readSave` touches localStorage, and re-reading it
  // on every render would also make the "20 minutes ago" line jitter as you look at it.
  const [shelved] = useState(() => readSave());
  const [seated, setSeated] = useState(false);
  /** The art room, in front of everything. Held here, not in `GameState`: which
   *  pictures this device uses is a fact about the device, not about the game. */
  const [drawing, setDrawing] = useState(false);
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
  // The overhead board is a grown-up's debug peek, off by default. The game is the
  // first-person view; being able to flip between them is only here so the map idea
  // can be judged against the thing it replaced.
  const [overhead, setOverhead] = useState(false);
  const shopOpen = useGame((s) => s.shopOpen);
  const openShop = useGame((s) => s.openShop);
  const closeShop = useGame((s) => s.closeShop);
  const buy = useGame((s) => s.buy);
  const clearDraw = useGame((s) => s.clearDraw);
  const clearFind = useGame((s) => s.clearFind);
  const canSearch = useCanSearch();
  const canFish = useCanFish();
  const canHook = useCanHook();
  const hookTargets = useHookTargets();
  const fish = useGame((s) => s.fish);
  const castHook = useGame((s) => s.hook);
  const [hooking, setHooking] = useState(false);
  const canGive = useCanGive();
  const fightParty = useFighters();
  const inviteTargets = useInviteTargets();
  const callForHelp = useGame((s) => s.invite);
  const supportChoices = useSupportChoices();
  const pledgeSupport = useGame((s) => s.pledgeSupport);
  const withdrawSupport = useGame((s) => s.withdrawSupport);
  const giveTargets = useGiveTargets();
  const handOver = useGame((s) => s.give);
  const [giving, setGiving] = useState(false);
  const canTrade = useCanTrade();
  const canDonate = useCanDonate();
  const canHeal = useCanHeal();
  const canPayOff = useCanPayOff();
  const canFightThief = useCanFightThief();
  const canSetGem = useCanSetGem();
  const canSwingTwice = useCanSwingTwice();
  const thiefHere = useThiefHere();
  const healTargets = useHealTargets();
  const donate = useGame((s) => s.donate);
  const heal = useGame((s) => s.heal);
  const payOff = useGame((s) => s.payOff);
  const takeOnThief = useGame((s) => s.fightThief);
  const setGem = useGame((s) => s.setGem);
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

  // The title screen owns the first moment: who is playing, or carry on from the game
  // on the shelf. Held in the view rather than in `GameState` because it is a question
  // about *this device* and not about the game — a resumed save must not put the party
  // back through the picker.
  // The art room stands in front of everything, including the title screen: it is a
  // thing you do to the game rather than in it.
  if (drawing) return <ArtRoom onClose={() => setDrawing(false)} />;

  if (!seated) {
    return (
      <TitleScreen
        saved={shelved?.at ?? null}
        onResume={() => {
          if (resume()) setSeated(true);
        }}
        onStart={(roster: Role[]) => {
          newGame(undefined, roster);
          setSeated(true);
        }}
        onArtRoom={() => setDrawing(true)}
      />
    );
  }

  return (
    <div className="app">
      {/* The wobble filters and hatch patterns every drawing points into. Mounted once. */}
      <CrayonDefs />
      <header className="topbar">
        <div className="brand">
          <h1>Hex RPG</h1>
          <span className="version">v0.29 — everything has a face</span>
        </div>
        <button
          type="button"
          className="peek"
          title="Replace any of the game's pictures with your own drawings"
          onClick={() => setDrawing(true)}
        >
          Our drawings
        </button>
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
          // Keyed on whose turn it is, so React remounts the banner and the entrance
          // animation replays. With one device going round a table, "it is your go"
          // has to be impossible to miss.
          key={player.id}
          player={player}
          moves={legalMoves.size}
          smoke={smellsSmoke(game, player)}
          rim={rimWarning(game, player)}
          standingOnIt={doomed(player.hex, game.turn, game.turnLimit)}
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
            turnLimit={game.turnLimit}
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
            turnLimit={game.turnLimit}
            sensed={sense(game, player)}
            legalMoves={legalMoves}
            onMove={moveTo}
          />
        )}
        {/* Under the map, not off in the corner of the sidebar.
            A child looks at the ground, decides, and reaches for the button - and on a
            tablet passed round a table that reach has to be short and in the same place
            their eyes already are. Up in the sidebar it was a diagonal across the whole
            screen from the hex they had just tapped. */}
        <div className="deck">
          {/* Free, and not the turn's action - so it sits with the map and the buttons
              rather than among them, and above the one that ends the turn. */}
          {player.gem && !over && (
            <GemBar gem={player.gem} canSet={canSetGem} onSet={setGem} />
          )}

          <ActionBar
            canMove={legalMoves.size > 0}
            moved={hasMoved(player)}
            acted={player.actedThisTurn}
            canSearch={canSearch}
            searchKind={searchKind(game.tiles[key(player.hex)])}
            canFish={canFish}
            freshWater={!game.tiles[key(player.hex)]?.searched}
            canHook={canHook}
            canGive={canGive}
            canTrade={canTrade}
            canDonate={canDonate}
            canHeal={canHeal}
            canPayOff={canPayOff}
            canFightThief={canFightThief}
            thief={thiefHere}
            onSearch={search}
            onFish={fish}
            onHook={() => setHooking(true)}
            onGive={() => setGiving(true)}
            onTrade={openShop}
            onDonate={donate}
            onHeal={() => healTargets[0] && heal(healTargets[0].id)}
            onPayOff={payOff}
            onFightThief={takeOnThief}
            onEndTurn={endTurn}
            disabled={over || game.combat !== null}
          />
        </div>
      </main>

      <aside className="sidebar">
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
          canSwingTwice={canSwingTwice}
          onFlee={flee}
          onTakeLoot={takeLoot}
          party={fightParty}
          inviteTargets={inviteTargets}
          onInvite={callForHelp}
          supportChoices={supportChoices}
          onSupport={pledgeSupport}
          onUnsupport={withdrawSupport}
          onEat={eat}
          onClose={closeCombat}
          ground={game.tiles[key(fight.enemy.hex)]}
        />
      )}

      {game.draw && !game.combat && !game.ending && (
        <EventCardModal draw={game.draw} turn={game.turn} onClose={clearDraw} />
      )}

      {/* Behind the turn's card, so a search on the last turn is never what the next
          player sees first. Nothing else can be open: a search is the turn's action. */}
      {game.find && !game.draw && !game.combat && !game.ending && (
        <FindCard find={game.find} onClose={clearFind} />
      )}

      {giving && canGive && !game.combat && !game.ending && (
        <GiveModal
          offers={giveTargets}
          onGive={(toId, itemId) => {
            handOver(toId, itemId);
            setGiving(false);
          }}
          onClose={() => setGiving(false)}
        />
      )}

      {hooking && canHook && !game.combat && !game.ending && (
        <HookModal
          targets={hookTargets}
          onCast={(id, how) => {
            castHook(id, how);
            setHooking(false);
          }}
          onClose={() => setHooking(false)}
        />
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
