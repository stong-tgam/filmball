/**
 * The active-player banner and the party list.
 *
 * With one device passed around a table, whose turn it is has to be unmissable, so
 * the banner carries the name, the role's colour, health and money at a size you can
 * read from the other side of the table.
 */

import { ROLES } from "../game/players";
import { moveRange } from "../game/turn";
import type { Player } from "../game/types";

export function ActivePlayerBanner({ player, moves }: { player: Player; moves: number }) {
  const role = ROLES[player.role];
  return (
    <div className="banner" style={{ ["--who" as string]: role.colour }}>
      <div className="banner-who">
        <span className="banner-dot" aria-hidden="true" />
        <div>
          <h2>{player.name}&rsquo;s turn</h2>
          <p className="banner-blurb">{role.blurb}</p>
        </div>
      </div>
      <dl className="banner-stats">
        <div>
          <dt>Health</dt>
          <dd>
            {player.health}
            <span className="of">/{player.maxHealth}</span>
          </dd>
        </div>
        <div>
          <dt>Money</dt>
          <dd>${player.money}</dd>
        </div>
        <div>
          <dt>Move</dt>
          <dd>{player.movedThisTurn ? "used" : `${moveRange(player)} tiles`}</dd>
        </div>
      </dl>
      <p className="banner-hint">
        {player.movedThisTurn
          ? "Move used. End the turn when you are ready."
          : moves === 0
            ? "Nowhere to move from here. End the turn to stay put."
            : `${moves} tiles to choose from. Tap one to move, or end the turn to stay put.`}
      </p>
    </div>
  );
}

export function PartyList({ players, activeId }: { players: Player[]; activeId: string }) {
  return (
    <ul className="party">
      {players.map((player) => {
        const role = ROLES[player.role];
        return (
          <li
            key={player.id}
            className={`party-row${player.id === activeId ? " is-active" : ""}${player.dead ? " is-dead" : ""}`}
            style={{ ["--who" as string]: role.colour }}
          >
            <span className="party-dot" aria-hidden="true" />
            <span className="party-name">{player.name}</span>
            <span className="party-health" title="Health">
              {player.health}/{player.maxHealth}
            </span>
            <span className="party-money">${player.money}</span>
          </li>
        );
      })}
    </ul>
  );
}
