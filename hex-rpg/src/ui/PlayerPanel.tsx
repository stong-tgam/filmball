/**
 * The active-player banner and the party list.
 *
 * With one device passed around a table, whose turn it is has to be unmissable, so
 * the banner carries the name, the role's colour, health and money at a size you can
 * read from the other side of the table.
 */

import { SKILLS, hasSkill } from "../game/skills";
import { ROLES } from "../game/players";
import ItemArt from "./art/items";
import RoleArt from "./art/roles";
import { roleSlot } from "../artslots";
import { gearLabel } from "../game/items";
import { moveRange, stepsLeft } from "../game/turn";
import type { Player, Team } from "../game/types";
import Art from "./art/Art";

export function ActivePlayerBanner({
  player,
  team,
  moves,
  smoke,
  rim,
  standingOnIt,
}: {
  player: Player;
  /** The team whose go it is. All of them walk; all of them play the mini-game. */
  team?: Team;
  moves: number;
  /** The dragon is within smelling distance. The one hint the fog ever gives. */
  smoke?: boolean;
  /** The rim falls when this turn ends (`collapse.ts`), or null on a safe turn. */
  rim?: string | null;
  /** ...and this player is standing on the part that goes. */
  standingOnIt?: boolean;
}) {
  const role = ROLES[player.role];
  return (
    <div
      className={`banner${rim ? (standingOnIt ? " banner-doomed" : " banner-rim") : ""}`}
      style={{ ["--who" as string]: role.colour }}
    >
      <div className="banner-who">
        {/* Their own drawing, on their own colour. The biggest picture of a player
            anywhere in the game, and it is on screen for their whole turn. */}
        <span className="banner-dot" aria-hidden="true">
          <svg viewBox="0 0 100 100">
            <Art slot={roleSlot(player.role)} fit="slice">
              <RoleArt role={player.role} />
            </Art>
          </svg>
        </span>
        <div>
          {/* The team's turn, not the player's - the name on the banner has to be
              the thing that moves, or a child will move their own piece. */}
          <h2>{team ? `${team.name}\u2019s turn` : `${player.name}\u2019s turn`}</h2>
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
      {/* The one warning in the game that a player has to act on, so it goes above
          the hint and shouts. A turn's notice is always enough: one step gets anybody
          clear, which is what keeps the abyss a mistake rather than bad luck. */}
      {rim && <p className="banner-rim-warning">{rim}</p>}
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
  teams,
  onEat,
}: {
  players: Player[];
  activeId: string;
  /** Who walks with whom. The list is grouped by it, because the team is the piece. */
  teams: Team[];
  onEat: (playerId: string, itemId: string) => void;
}) {
  return (
    <ul className="party">
      {teams.flatMap((team) => [
        // The team's own line, so a child can see at a glance which two or three
        // names move together - which is the first rule of the game.
        <li key={team.id} className="party-team">
          {team.name}
        </li>,
        ...players
          .filter((p) => team.memberIds.includes(p.id))
          .map((player) => {
        const role = ROLES[player.role];
        const skill = SKILLS[player.role];
        return (
          <li
            key={player.id}
            className={`party-row${player.id === activeId ? " is-active" : ""}${
              player.health === 0 ? " is-flat" : ""
            }${player.gone ? " is-gone" : ""}`}
            style={{ ["--who" as string]: role.colour }}
          >
            <span className="party-dot" aria-hidden="true">
              <svg viewBox="0 0 100 100">
                <Art slot={roleSlot(player.role)} fit="slice">
                  <RoleArt role={player.role} />
                </Art>
              </svg>
            </span>
            <span className="party-name">{player.name}</span>
            {/* What health is actually for now. A struck-through skill says why it
                matters far better than a number does. */}
            <span
              className={`party-skill${hasSkill(player) ? "" : " is-spent"}`}
              title={hasSkill(player) ? skill.text : `${skill.title} is gone until somebody gives them a health.`}
            >
              {skill.title}
            </span>
            <span className="party-health" title={player.gone ? "Over the edge" : "Health"}>
              {player.gone ? "lost" : `${player.health}/${player.maxHealth}`}
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
                        <Art slot={`item:${item.name}`}><ItemArt name={item.name} seedName={item.id} /></Art>
                      </svg>
                      {gearLabel(item)}
                    </span>
                  ))}
              </span>
            )}

            {player.supply.length > 0 && !player.gone && (
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
                      <Art slot={`item:${item.name}`}><ItemArt name={item.name} seedName={item.id} /></Art>
                    </svg>
                    {gearLabel(item)}
                  </button>
                ))}
              </span>
            )}
          </li>
        );
      }),
      ])}
    </ul>
  );
}
