/**
 * The zustand store is a thin shell around `src/game/`: it holds a GameState and
 * swaps it for the one the pure functions return. No rules live here.
 */

import { create } from "zustand";
import { startGame } from "./setup";
import { randomSeed } from "./rng";
import { activePlayer, clearDraw, endTurn, legalMoves, movePlayer } from "./turn";
import {
  attack,
  canInvite,
  combatants,
  endCombat,
  fighters,
  flee,
  invite,
  inviteTargets,
  pledgeSupport,
  supportOptions,
  takeSpoil,
  withdrawSupport,
} from "./combat";
import {
  buy,
  canHeal,
  canFish,
  canGive,
  canHook,
  canSearch,
  canTrade,
  clearFind,
  eat,
  fish,
  give,
  giveTargets,
  hook,
  hookTargets,
  heal,
  healTargets,
  openShop,
  search,
  sell,
} from "./actions";
import { canDonate, canFightThief, canPayOff, donate, fightThief, payOff, thiefFacing } from "./hazards";
import { clearSave, readSave, saveGame } from "./save";
import type { Enemy, GameState, Item, Player, Role, Tile } from "./types";

type Store = {
  game: GameState;
  /** Tile the player last tapped, for the inspector panel. Pure UI state. */
  selected: string | null;
  /** Who is playing. Undefined keeps `TURN_ORDER`, which is what the tests and sim use. */
  newGame: (seed?: number, roster?: Role[]) => void;
  /** Put the shelved game back on the table. False when there was nothing readable. */
  resume: () => boolean;
  select: (label: string | null) => void;
  tile: (label: string) => Tile | undefined;
  moveTo: (label: string) => void;
  endTurn: () => void;
  attack: () => void;
  flee: () => void;
  search: () => void;
  fish: () => void;
  hook: (targetId: string, how: "pull" | "cross") => void;
  give: (toId: string, itemId: string) => void;
  donate: () => void;
  /** Shops are a panel, not a phase: opening one spends the turn's action. */
  shopOpen: boolean;
  openShop: () => void;
  closeShop: () => void;
  buy: (itemId: string) => void;
  sell: (itemId: string) => void;
  heal: (playerId: string) => void;
  payOff: () => void;
  fightThief: () => void;
  eat: (playerId: string, itemId: string) => void;
  takeLoot: (itemId: string, toId?: string) => void;
  /** Rulebook §8: shout somebody into the fight. It does not cost them their turn. */
  invite: (playerId: string) => void;
  /** Patch somebody up this round instead of rolling. */
  pledgeSupport: (byId: string, toId: string) => void;
  withdrawSupport: (byId: string) => void;
  /** Put the turn's card away once the table has read it. */
  clearDraw: () => void;
  /** Put away what the last search turned up. */
  clearFind: () => void;
  /** Close the fight, and pass the turn on now that it is spent. */
  closeCombat: () => void;
};

export const useGame = create<Store>((set, get) => ({
  game: startGame(randomSeed()),
  selected: null,
  newGame: (seed, roster) =>
    set({ game: startGame(seed ?? randomSeed(), roster), selected: null, shopOpen: false }),
  resume: () => {
    const shelved = readSave();
    if (!shelved) return false;
    set({ game: shelved.game, selected: null, shopOpen: false });
    return true;
  },
  select: (label) => set({ selected: label }),
  tile: (label) => get().game.tiles[label],
  moveTo: (label) => set({ game: movePlayer(get().game, label), selected: null }),
  endTurn: () => set({ game: endTurn(get().game), selected: null }),
  attack: () => set({ game: attack(get().game) }),
  flee: () => set({ game: flee(get().game) }),
  closeCombat: () => set({ game: endTurn(endCombat(get().game)), selected: null }),
  search: () => set({ game: search(get().game) }),
  fish: () => set({ game: fish(get().game) }),
  hook: (targetId, how) => set({ game: hook(get().game, targetId, how), selected: null }),
  give: (toId, itemId) => set({ game: give(get().game, toId, itemId) }),
  donate: () => set({ game: donate(get().game) }),
  shopOpen: false,
  openShop: () => set({ game: openShop(get().game), shopOpen: true }),
  closeShop: () => set({ shopOpen: false }),
  buy: (itemId) => set({ game: buy(get().game, itemId) }),
  sell: (itemId) => set({ game: sell(get().game, itemId) }),
  heal: (playerId) => set({ game: heal(get().game, playerId), selected: null }),
  payOff: () => set({ game: payOff(get().game) }),
  fightThief: () => set({ game: fightThief(get().game) }),
  eat: (playerId, itemId) => set({ game: eat(get().game, playerId, itemId) }),
  takeLoot: (itemId, toId) => set({ game: takeSpoil(get().game, itemId, toId) }),
  invite: (playerId) => set({ game: invite(get().game, playerId) }),
  pledgeSupport: (byId, toId) => set({ game: pledgeSupport(get().game, byId, toId) }),
  withdrawSupport: (byId) => set({ game: withdrawSupport(get().game, byId) }),
  clearDraw: () => set({ game: clearDraw(get().game) }),
  clearFind: () => set({ game: clearFind(get().game) }),
}));

/**
 * Write the game down after every change.
 *
 * A subscription rather than a call in each setter: there are twenty of them and the
 * twenty-first would be the one somebody forgot, and a save that is right most of the
 * time is worse than none - it loses an evening and looks like a different bug.
 *
 * A finished game clears the shelf instead of saving, so the title screen does not
 * offer to resume something that is over.
 */
useGame.subscribe((state) => {
  if (state.game.ending) clearSave();
  else saveGame(state.game);
});

/** Selectors, so components subscribe to the narrowest slice they can. */
export const useActivePlayer = (): Player => useGame((s) => activePlayer(s.game));
export const useLegalMoves = (): Map<string, number> =>
  useGame((s) => legalMoves(s.game, activePlayer(s.game)));

export const useCanSearch = (): boolean =>
  useGame((s) => canSearch(s.game, activePlayer(s.game)));
export const useCanFish = (): boolean =>
  useGame((s) => canFish(s.game, activePlayer(s.game)));
export const useCanHook = (): boolean =>
  useGame((s) => canHook(s.game, activePlayer(s.game)));
export const useHookTargets = (): Player[] =>
  useGame((s) => hookTargets(s.game, activePlayer(s.game)));
export const useCanGive = (): boolean =>
  useGame((s) => canGive(s.game, activePlayer(s.game)));
export const useGiveTargets = (): { player: Player; items: Item[] }[] =>
  useGame((s) => giveTargets(s.game, activePlayer(s.game)));
export const useCanTrade = (): boolean =>
  useGame((s) => canTrade(s.game, activePlayer(s.game)));
export const useCanDonate = (): boolean =>
  useGame((s) => canDonate(s.game, activePlayer(s.game)));
export const useCanPayOff = (): boolean =>
  useGame((s) => canPayOff(s.game, activePlayer(s.game)));
export const useCanFightThief = (): boolean =>
  useGame((s) => canFightThief(s.game, activePlayer(s.game)));
/** Which thief is standing here, and how much of the party's money they are holding. */
export const useThiefHere = (): { kind: "robber" | "pirates"; carrying: number } | null =>
  useGame((s) => {
    const kind = thiefFacing(s.game, activePlayer(s.game));
    if (!kind) return null;
    return { kind, carrying: s.game.hazards.find((h) => h.kind === kind)?.carrying ?? 0 };
  });
export const useCanHeal = (): boolean =>
  useGame((s) => canHeal(s.game, activePlayer(s.game)));
export const useHealTargets = (): Player[] =>
  useGame((s) => healTargets(s.game, activePlayer(s.game)));

/** Everybody swinging in the fight on screen, starter first. */
export const useFighters = (): Player[] => useGame((s) => fighters(s.game));
/** Who the starter could still shout to, per §8. */
export const useInviteTargets = (): Player[] => useGame((s) => inviteTargets(s.game));
export const useCanInvite = (): boolean => useGame((s) => canInvite(s.game));
/** For each fighter who could do something other than swing, who they could do it to. */
export const useSupportChoices = (): { who: Player; targets: Player[] }[] =>
  useGame((s) =>
    fighters(s.game)
      .map((who) => ({ who, targets: supportOptions(s.game, who) }))
      .filter((o) => o.targets.length > 0),
  );

/** The two sides of the fight on screen, or null when nobody is fighting. */
export const useCombatants = (): { player: Player; enemy: Enemy } | null =>
  useGame((s) => combatants(s.game));
