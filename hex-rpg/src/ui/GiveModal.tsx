/**
 * Handing something to somebody you are standing with.
 *
 * Only what the other player can actually take is listed. No swaps and no warnings:
 * a trade that quietly costs the receiver their better coat is the kind of thing that
 * starts an argument at the table, and "you can't give them that, they've got one" is
 * a sentence a seven-year-old should never have to hear from an adult reading rules.
 *
 * Grouped by person rather than by item, because the question at the table is always
 * "what can I give *you*", asked across the tile.
 */

import ItemArt from "./art/items";
import { gearLabel } from "../game/items";
import { ROLES } from "../game/players";
import type { Item, Player } from "../game/types";

export default function GiveModal({
  offers,
  onGive,
  onClose,
}: {
  offers: { player: Player; items: Item[] }[];
  onGive: (toId: string, itemId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Hand something over">
      <div className="modal hook">
        <p className="draw-turn">Standing together</p>
        <h2 className="hook-title">Hand something over</h2>

        <ul className="hook-list">
          {offers.map((offer) => (
            <li key={offer.player.id} className="hook-who">
              <span className="hook-name">
                <span className="blip-dot" style={{ background: ROLES[offer.player.role].colour }} />
                <strong>{offer.player.name}</strong>
                <em className="hook-down">
                  {" "}
                  — {offer.player.health}/{offer.player.maxHealth} health
                </em>
              </span>
              <ul className="stock">
                {offer.items.map((item) => (
                  <li key={item.id}>
                    <button type="button" className="buy" onClick={() => onGive(offer.player.id, item.id)}>
                      <svg viewBox="0 0 100 100" aria-hidden="true" className="buy-art">
                        <ItemArt name={item.name} seedName={item.id} />
                      </svg>
                      <span className="buy-name">{gearLabel(item)}</span>
                      <span className="buy-cost">give</span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <button type="button" onClick={onClose}>
          Keep it all
        </button>
      </div>
    </div>
  );
}
