// Gestion de la pioche, de la défausse et des jets « tirer ! ».

import { Card } from '../../../shared/types';
import { shuffle } from '../util';
import { GameState, ServerPlayer, addLog } from './state';

/** Reconstitue le deck à partir de la défausse si nécessaire. */
function ensureDeck(state: GameState): void {
  if (state.deck.length === 0 && state.discardPile.length > 0) {
    // On garde la carte du dessus de la défausse visible ? Règle officielle :
    // tout est mélangé pour reformer la pioche.
    state.deck = shuffle(state.discardPile);
    state.discardPile = [];
    addLog(state, 'La pioche est reconstituée à partir de la défausse.');
  }
}

/** Pioche une carte du dessus du deck (reconstitue si vide). */
export function drawCard(state: GameState): Card | null {
  ensureDeck(state);
  return state.deck.pop() ?? null;
}

/** Pioche N cartes. */
export function drawCards(state: GameState, n: number): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    const c = drawCard(state);
    if (c) out.push(c);
  }
  return out;
}

/** Met une carte sur la défausse. */
export function discard(state: GameState, card: Card): void {
  state.discardPile.push(card);
}

export function discardTop(state: GameState): Card | null {
  return state.discardPile[state.discardPile.length - 1] ?? null;
}

export interface DrawCheckResult {
  /** Carte(s) retournée(s). Lucky Duke en retourne 2 (la 1re est choisie). */
  cards: Card[];
  /** Carte retenue pour l'effet. */
  chosen: Card;
  /** Vrai si le prédicat est satisfait (= « succès » du jet). */
  success: boolean;
}

/**
 * Effectue un jet « tirer ! » : retourne la carte du dessus (2 pour Lucky Duke)
 * et applique le prédicat `predicate` pour déterminer le succès. Les cartes
 * retournées sont défaussées. Lucky Duke garde la meilleure (celle qui satisfait
 * le prédicat si possible).
 */
export function drawCheck(
  state: GameState,
  player: ServerPlayer,
  predicate: (c: Card) => boolean,
): DrawCheckResult {
  const isLucky = player.character === 'lucky_duke';
  const flips: Card[] = [];
  const first = drawCard(state);
  if (first) flips.push(first);
  if (isLucky) {
    const second = drawCard(state);
    if (second) flips.push(second);
  }

  let chosen: Card;
  if (isLucky && flips.length === 2) {
    // Choisit la carte qui satisfait le prédicat, sinon la première.
    chosen = flips.find((c) => predicate(c)) ?? flips[0];
  } else {
    chosen = flips[0];
  }

  // Défausse de toutes les cartes retournées.
  for (const c of flips) discard(state, c);

  return {
    cards: flips,
    chosen,
    success: chosen ? predicate(chosen) : false,
  };
}
