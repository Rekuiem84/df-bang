// Helpers de règles transverses.

import { GameState, ServerPlayer, activePlayer } from './state';
import { hasEquipment } from './distance';

/** Vrai si le joueur peut jouer un BANG! supplémentaire ce tour. */
export function canPlayerPlayBang(state: GameState, p: ServerPlayer): boolean {
  if (state.phase !== 'playing') return false;
  if (activePlayer(state).id !== p.id) return false;
  if (state.turnPhase !== 'play') return false;
  if (state.pendingAction) return false;
  const unlimited = p.character === 'willy_the_kid' || hasEquipment(p, 'volcanic');
  return unlimited || state.bangPlayedThisTurn === 0;
}

/** Une Bière est inutilisable lorsqu'il ne reste que 2 joueurs en vie. */
export function canUseBeer(state: GameState): boolean {
  return state.players.filter((p) => p.isAlive).length > 2;
}

/** Calamity Janet peut intervertir BANG! et Missed!. */
export function canUseAsMissed(p: ServerPlayer, cardName: string): boolean {
  if (cardName === 'missed') return true;
  if (cardName === 'bang' && p.character === 'calamity_janet') return true;
  return false;
}

export function canUseAsBang(p: ServerPlayer, cardName: string): boolean {
  if (cardName === 'bang') return true;
  if (cardName === 'missed' && p.character === 'calamity_janet') return true;
  return false;
}
