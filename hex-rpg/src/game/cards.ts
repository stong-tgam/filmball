/**
 * Two poker decks, per the spec: one drives the events, one drives searches.
 *
 * Keeping them separate matters. A single deck would tie "what turned up in the
 * woods" to "what happened this turn", and a run of face cards would make both go
 * strange at once.
 *
 * A deck is drawn down and reshuffled when it runs out, so over a game the odds are
 * the deck's odds rather than a die's - four kings exist, and once they are gone
 * they are gone until the shuffle.
 */

import { makeRng } from "./rng";
import type { Card, Rank, Suit } from "./types";

export const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
export const RANKS: Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

export const SUIT_PIP: Record<Suit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

export const isRed = (card: Card): boolean =>
  card.suit === "diamonds" || card.suit === "hearts";

/** Jacks, queens, kings and aces. These are the cards that make something happen. */
export const isFace = (card: Card): boolean => ["J", "Q", "K", "A"].includes(card.rank);

/** 2 through 10 score their number; the face cards run 11, 12, 13, 14. */
export const rankValue = (card: Card): number => RANKS.indexOf(card.rank) + 2;

export const cardName = (card: Card): string => `${card.rank}${SUIT_PIP[card.suit]}`;

export function freshDeck(rngState: number): { deck: Card[]; rngState: number } {
  const rng = makeRng(rngState);
  const cards = SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
  return { deck: rng.shuffle(cards), rngState: rng.state() };
}

/**
 * Take the top card. An empty deck is reshuffled first, so play never stops for want
 * of a card.
 */
export function draw(
  deck: Card[],
  rngState: number,
): { card: Card; deck: Card[]; rngState: number } {
  if (deck.length === 0) {
    const shuffled = freshDeck(rngState);
    return { card: shuffled.deck[0], deck: shuffled.deck.slice(1), rngState: shuffled.rngState };
  }
  return { card: deck[0], deck: deck.slice(1), rngState };
}
