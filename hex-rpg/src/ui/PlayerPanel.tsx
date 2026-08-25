/**
 * The active-player banner and the party list.
 *
 * With one device passed around a table, whose turn it is has to be unmissable, so
 * the banner carries the name, the role's colour, health and money at a size you can
 * read from the other side of the table.
 */

import { ROLES } from "../game/players";
import ItemArt from "./art/items";
import { gearLabel } from "../game/items";
import { moveRange, stepsLeft } from "../game/turn";
import type { Player } from "../game/types";

export function ActivePlayerBanner({
  player,
  moves,
  smoke,
}: {
  player: Player;
  moves: number;
  /** The dragon is within smelling distance. The one hint the fog ever gives. */
  smoke?: boolean;
}) {
  const role = ROLES[player.role];
  return (
    <div className="banner" style={{ ["--who" as string]: role.colour }}>
      <div className="banner-who">
        <span className="banner-dot" aria-hidden="true" />
        <div>
          <h2>{player.name}&rsquo;s turn</h2>
          <p className="banner-blurb">
            {smoke ? "Smoke on the wind. The dragon is close." : role.blurb}
          </p>
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
          <dd>
            {!stepsLeft(player)
              ? "used"
              : `${stepsLeft(player)} of ${moveRange(player)}`}
          </dd>
        </div>
      </dl>
      <p className="banner-hint">
        {!stepsLeft(player)
          ? "Move used. End the turn when you are ready."
          : moves === 0
            ? "Nowhere to step from here. End the turn to stay put."
            : stepsLeft(player) > 1
              ? // Say what the extra step is for: take one, look at what it turned up,
                // then decide. Otherwise a child reads "2 steps" as "pick a tile twice".
                `Take a step and see what is there — ${stepsLeft(player)} steps left, and you can stop after any of them.`
              : `${moves} ${moves === 1 ? "way" : "ways"} to step. Tap one, or end the turn to stay put.`}
      </p>
    </div>
  );
}

/**
 * The party.
 *
 * Food sits under whoever is carrying it and can be eaten at any moment - on someone
 * else's turn, mid-fight, whenever. That is the spec's rule and it is a good one: the
 * player watching their sibling's turn still has something they can do.
 */
export function PartyList({
  players,
  activeId,
  onEat,
}: {
  players: Player[];
  activeId: string;
  onEat: (playerId: string, itemId: string) => void;
}) {
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

            {(player.weapon || player.armor || player.boots || player.spareArmor) && (
              <span className="party-gear">
                {[player.weapon, player.armor, player.boots, player.spareArmor]
                  .filter((i): i is NonNullable<typeof i> => i !== null)
                  .map((item) => (
                    <span
                      key={item.id}
                      className={`kit kit-${item.slot}${item.id === player.spareArmor?.id ? " kit-spare" : ""}`}
                      title={
                        item.id === player.spareArmor?.id
                          ? `Spare — ${item.name}. Stand with somebody and hand it over.`
                          : item.name
                      }
                    >
                      <svg viewBox="0 0 100 100" aria-hidden="true" className="kit-art">
                        <ItemArt name={item.name} seedName={item.id} />
                      </svg>
                      {gearLabel(item)}
                    </span>
                  ))}
              </span>
            )}

            {player.supply.length > 0 && !player.dead && (
              <span className="party-supply">
                {player.supply.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="eat"
                    onClick={() => onEat(player.id, item.id)}
                    disabled={item.value <= 0 || player.health >= player.maxHealth}
                    title={
                      item.value <= 0
                        ? `The ${item.name} is not food. Sell it, or let a thief take it.`
                        : player.health >= player.maxHealth
                          ? `${player.name} is on full health`
                          : `Eat the ${item.name} for ${item.value} health`
                    }
                  >
                    <svg viewBox="0 0 100 100" aria-hidden="true" className="kit-art">
                      <ItemArt name={item.name} seedName={item.id} />
                    </svg>
                    {gearLabel(item)}
                  </button>
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
