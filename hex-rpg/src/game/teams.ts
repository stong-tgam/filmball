/**
 * Teams. The unit that walks the board, and the unit that plays a mini-game.
 *
 * A fight is now a challenge several people do together - so the thing standing on a
 * tile has to be several people. A team moves as one, fights as one and shows **all of
 * its tokens** on the hex, because all of them are about to be drawing, acting or
 * shouting the answer.
 *
 * | at the table | teams |
 * |---|---|
 * | 2 | one team of 2 |
 * | 3 | one team of 3 |
 * | 4 | two teams of 2 |
 * | 5 | teams of 3 and 2 |
 *
 * **Two is the minimum and it is a real rule**, not a default: every game in the box
 * needs somebody to guess, to argue, or to be drawn for. One child and a timer is
 * homework.
 *
 * Why teams and not five separate turns: five goes a turn against an eight-turn limit
 * is forty goes an evening, and thirty-two of them are somebody else's. Two teams is
 * **two movements a turn and at most two fights**, and it is the reason the evening
 * fits in an evening.
 *
 * The player is still the record that carries health, gear and a skill. A team is a
 * list of ids and nothing else, which is what keeps it out of the way of every rule
 * written before it.
 */

import type { GameState, Player, Team } from "./types";

/** Below this there is nobody to play with. */
export const MIN_PARTY = 2;

/**
 * How a party splits.
 *
 * Four and five split; two and three do not. A pair of teams needs two people each to
 * be a team at all, so three stays whole - and 3-and-2 is the only way five works.
 */
export function teamSizes(count: number): number[] {
  if (count <= 3) return [count];
  if (count === 4) return [2, 2];
  return [3, 2];
}

export function createTeams(players: Player[]): Team[] {
  const sizes = teamSizes(players.length);
  const teams: Team[] = [];
  let at = 0;
  sizes.forEach((size, i) => {
    const members = players.slice(at, at + size);
    at += size;
    teams.push({
      id: `team-${i + 1}`,
      // Named after the people in it, because a child looking for their piece is
      // looking for their own name and not for "Team 2".
      name: members.map((p) => p.name).join(" & "),
      memberIds: members.map((p) => p.id),
    });
  });
  return teams;
}

/** Everybody in the team, in order, minus anybody the abyss took. */
export const membersOf = (state: GameState, team: Team): Player[] =>
  team.memberIds
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined && !p.gone);

export const teamOf = (state: GameState, playerId: string): Team | undefined =>
  state.teams.find((t) => t.memberIds.includes(playerId));

export const activeTeam = (state: GameState): Team | undefined =>
  teamOf(state, state.players[state.activePlayerIndex]?.id);

/** The team that is up, as people. The first is the one whose turn it formally is. */
export const activeMembers = (state: GameState): Player[] => {
  const team = activeTeam(state);
  return team ? membersOf(state, team) : [];
};

/**
 * The first member still at the table.
 *
 * Turn order is kept as an index into `players` rather than into `teams`, so that
 * every rule written before teams existed - one action a turn, whose card it is, who
 * the shop is serving - keeps working unchanged. This is the player that index points
 * at when a team's go comes round.
 */
export const leaderOf = (state: GameState, team: Team): Player | undefined =>
  membersOf(state, team)[0];
