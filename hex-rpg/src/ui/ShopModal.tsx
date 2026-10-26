/**
 * The city shop.
 *
 * Food on the left, gear on the right, prices on everything, and anything you cannot
 * afford or cannot carry is visibly out of reach rather than missing - a child should
 * be able to see what they are saving up for.
 *
 * Gear comes off the game's one pile, so the shelf is short and what is on it is
 * genuinely gone once somebody buys it.
 */

import { SUPPLY_CAP } from "../game/items";
import type { Item, Player } from "../game/types";

type Props = {
  player: Player;
  gear: Item[];
  food: Item[];
  onBuy: (itemId: string) => void;
  onClose: () => void;
};

const SLOT_NOTE: Record<string, string> = {
  weapon: "damage",
  armor: "armour",
  boots: "extra tile",
  supply: "health",
};

function Shelf({
  title,
  items,
  player,
  empty,
  onBuy,
}: {
  title: string;
  items: Item[];
  player: Player;
  empty: string;
  onBuy: (id: string) => void;
}) {
  return (
    <section className="shelf">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul className="stock">
          {items.map((item) => {
            const packFull = item.slot === "supply" && player.supply.length >= SUPPLY_CAP;
            const tooDear = player.money < item.cost;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="buy"
                  disabled={tooDear || packFull}
                  onClick={() => onBuy(item.id)}
                >
                  <span className="buy-name">{item.name}</span>
                  <span className="buy-value">
                    +{item.value} {SLOT_NOTE[item.slot]}
                  </span>
                  <span className="buy-cost">${item.cost}</span>
                </button>
                {packFull && <p className="muted small">Pack full.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function ShopModal({ player, gear, food, onBuy, onClose }: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Shop">
      <div className="modal">
        <header className="shop-head">
          <h2>Market</h2>
          <p className="muted">
            {player.name} has <strong>${player.money}</strong>
          </p>
        </header>

        <div className="shelves">
          <Shelf
            title="Food"
            items={food}
            player={player}
            empty="Sold out."
            onBuy={onBuy}
          />
          <Shelf
            title="Gear"
            items={gear}
            player={player}
            empty="Nothing left in the world to sell."
            onBuy={onBuy}
          />
        </div>

        <footer className="fight-foot">
          <p className="muted small">
            Buying gear you already have a slot for swaps the old one out, and it goes
            back into the world for somebody else to find.
          </p>
          <button type="button" onClick={onClose}>
            Leave the market
          </button>
        </footer>
      </div>
    </div>
  );
}
