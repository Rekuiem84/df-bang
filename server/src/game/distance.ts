// Calcul des distances entre joueurs (système du cercle BANG!).

import { GameState, ServerPlayer } from './state';

/** Vrai si le joueur possède (ou simule) l'équipement nommé. */
export function hasEquipment(p: ServerPlayer, name: string): boolean {
  return p.inPlay.some((c) => c.name === name);
}

/** Modificateur de distance « vu par les autres » (Mustang / Paul Regret). */
function viewedAtBonus(p: ServerPlayer): number {
  let bonus = 0;
  if (hasEquipment(p, 'mustang')) bonus += 1;
  if (p.character === 'paul_regret') bonus += 1;
  return bonus;
}

/** Modificateur de distance « vu par le porteur » (Lunette / Rose Doolan). */
function viewerBonus(p: ServerPlayer): number {
  let bonus = 0;
  if (hasEquipment(p, 'scope')) bonus -= 1;
  if (p.character === 'rose_doolan') bonus -= 1;
  return bonus;
}

/** Distance « physique » dans le cercle des joueurs vivants. */
function ringDistance(state: GameState, fromId: string, toId: string): number {
  const alive = state.players.filter((p) => p.isAlive);
  const n = alive.length;
  const i = alive.findIndex((p) => p.id === fromId);
  const j = alive.findIndex((p) => p.id === toId);
  if (i < 0 || j < 0) return Infinity;
  const raw = Math.abs(i - j);
  return Math.min(raw, n - raw);
}

/**
 * Distance effective de `from` vers `to` en tenant compte des équipements.
 * Minimum 1.
 */
export function distanceBetween(state: GameState, fromId: string, toId: string): number {
  if (fromId === toId) return 0;
  const from = state.players.find((p) => p.id === fromId);
  const to = state.players.find((p) => p.id === toId);
  if (!from || !to) return Infinity;

  let d = ringDistance(state, fromId, toId);
  d += viewedAtBonus(to); // la cible paraît plus loin
  d += viewerBonus(from); // l'observateur voit plus près
  return Math.max(1, d);
}

/** Portée d'attaque de `from` (arme équipée, défaut 1). */
export function attackRange(from: ServerPlayer): number {
  const weapon = from.inPlay.find((c) => c.isWeapon);
  return weapon?.weaponRange ?? 1;
}

/** Vrai si `from` peut atteindre `to` avec un BANG!. */
export function isInRange(state: GameState, fromId: string, toId: string): boolean {
  const from = state.players.find((p) => p.id === fromId);
  if (!from) return false;
  return distanceBetween(state, fromId, toId) <= attackRange(from);
}

/** Carte des distances depuis `fromId` vers tous les autres vivants. */
export function distanceMap(state: GameState, fromId: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of state.players) {
    if (p.id === fromId || !p.isAlive) continue;
    map[p.id] = distanceBetween(state, fromId, p.id);
  }
  return map;
}
