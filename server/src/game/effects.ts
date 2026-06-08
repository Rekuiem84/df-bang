// Effets fondamentaux : dégâts, soin, élimination, conditions de victoire.

import { Role } from '../../../shared/types';
import { roleLabel, CHARACTER_LABELS } from '../../../shared/data';
import { GameState, ServerPlayer, addLog, getPlayer } from './state';
import { drawCards, discard } from './deck';
import { canUseBeer } from './rules';

/** Retire une carte aléatoire de la main d'un joueur et la retourne. */
function stealRandomFromHand(victim: ServerPlayer): ReturnType<typeof Array.prototype.pop> {
  if (victim.hand.length === 0) return null;
  const idx = Math.floor(Math.random() * victim.hand.length);
  return victim.hand.splice(idx, 1)[0];
}

export interface DamageResult {
  died: boolean;
}

/**
 * Applique `amount` PV de dégâts à `target`, provoqués par `sourceId` (optionnel).
 * Gère les pouvoirs Bart Cassidy (pioche) et El Gringo (vol), puis la tentative
 * de sauvetage par Bière et l'élimination.
 */
export function dealDamage(
  state: GameState,
  target: ServerPlayer,
  amount: number,
  sourceId: string | null,
): DamageResult {
  if (!target.isAlive || amount <= 0) return { died: false };

  target.hp -= amount;
  addLog(state, `${target.pseudo} perd ${amount} PV (${Math.max(0, target.hp)} restant).`);

  // Bart Cassidy : pioche 1 carte par PV perdu.
  if (target.character === 'bart_cassidy') {
    const drawn = drawCards(state, amount);
    target.hand.push(...drawn);
    if (drawn.length) addLog(state, `${target.pseudo} (Bart Cassidy) pioche ${drawn.length} carte(s).`);
  }

  // El Gringo : vole 1 carte au hasard à la source, par PV perdu.
  if (target.character === 'el_gringo' && sourceId) {
    const source = getPlayer(state, sourceId);
    if (source && source.id !== target.id) {
      for (let i = 0; i < amount; i++) {
        const stolen = stealRandomFromHand(source);
        if (stolen) target.hand.push(stolen);
      }
      addLog(state, `${target.pseudo} (El Gringo) vole une carte à ${source.pseudo}.`);
    }
  }

  // Tentative de sauvetage automatique par Bière (sauf s'il reste 2 joueurs).
  if (target.hp <= 0 && canUseBeer(state)) {
    while (target.hp <= 0) {
      const beerIdx = target.hand.findIndex((c) => c.name === 'beer');
      if (beerIdx < 0) break;
      const beer = target.hand.splice(beerIdx, 1)[0];
      discard(state, beer);
      target.hp = 1;
      addLog(state, `${target.pseudo} joue une Bière in extremis et survit à 1 PV.`);
    }
  }

  if (target.hp <= 0) {
    eliminate(state, target, sourceId);
    return { died: true };
  }

  return { died: false };
}

/** Soigne `amount` PV (plafonné à maxHp). */
export function heal(state: GameState, target: ServerPlayer, amount: number): void {
  if (!target.isAlive) return;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  if (target.hp > before) {
    addLog(state, `${target.pseudo} récupère ${target.hp - before} PV.`);
  }
}

/** Élimine un joueur : Vulture Sam, défausse, révélation, récompenses, pénalité. */
export function eliminate(state: GameState, victim: ServerPlayer, killerId: string | null): void {
  if (!victim.isAlive) return;
  victim.isAlive = false;
  addLog(state, `💀 ${victim.pseudo} est éliminé (${roleLabel(victim.role, state.theme)} — ${CHARACTER_LABELS[victim.character]}).`);

  const allCards = [...victim.hand, ...victim.inPlay];
  victim.hand = [];
  victim.inPlay = [];

  // Vulture Sam récupère toutes les cartes des éliminés.
  const sam = state.players.find((p) => p.character === 'vulture_sam' && p.isAlive && p.id !== victim.id);
  if (sam) {
    sam.hand.push(...allCards);
    if (allCards.length) addLog(state, `${sam.pseudo} (Vulture Sam) récupère ${allCards.length} carte(s).`);
  } else {
    for (const c of allCards) discard(state, c);
  }

  const killer = killerId ? getPlayer(state, killerId) : null;

  // Récompense : éliminer un Hors-la-loi fait piocher 3 cartes au tueur.
  if (victim.role === 'outlaw' && killer && killer.isAlive) {
    killer.hand.push(...drawCards(state, 3));
    addLog(state, `${killer.pseudo} pioche 3 cartes pour avoir éliminé un Hors-la-loi.`);
  }

  // Pénalité : si le Shérif élimine un Adjoint, il défausse toute sa main et son jeu.
  if (victim.role === 'deputy' && killer && killer.role === 'sheriff') {
    const penalty = [...killer.hand, ...killer.inPlay];
    killer.hand = [];
    killer.inPlay = [];
    for (const c of penalty) discard(state, c);
    addLog(state, `${killer.pseudo} (Shérif) a tué un Adjoint : il défausse toutes ses cartes.`);
  }
}

/**
 * Évalue les conditions de victoire. Retourne le résultat si la partie est
 * terminée, sinon null.
 */
export function checkWinConditions(
  state: GameState,
): { role: Role; playerIds: string[]; condition: string } | null {
  const alive = state.players.filter((p) => p.isAlive);
  const sheriff = state.players.find((p) => p.role === 'sheriff');
  const sheriffAlive = !!sheriff && sheriff.isAlive;

  const outlawsAlive = alive.filter((p) => p.role === 'outlaw').length;
  const renegadeAlive = alive.filter((p) => p.role === 'renegade').length;

  if (!sheriffAlive) {
    // Renégat seul survivant → victoire du Renégat.
    if (alive.length === 1 && alive[0].role === 'renegade') {
      return {
        role: 'renegade',
        playerIds: [alive[0].id],
        condition: `Le ${roleLabel('renegade', state.theme)} est le dernier survivant.`,
      };
    }
    // Sinon, les Hors-la-loi gagnent.
    return {
      role: 'outlaw',
      playerIds: state.players.filter((p) => p.role === 'outlaw').map((p) => p.id),
      condition: `Le ${roleLabel('sheriff', state.theme)} a été éliminé : les ${roleLabel('outlaw', state.theme)}s l'emportent.`,
    };
  }

  // Shérif vivant : victoire Shérif + Adjoints si plus aucun Hors-la-loi ni Renégat.
  if (outlawsAlive === 0 && renegadeAlive === 0) {
    return {
      role: 'sheriff',
      playerIds: state.players
        .filter((p) => p.role === 'sheriff' || p.role === 'deputy')
        .map((p) => p.id),
      condition: `Tous les ${roleLabel('outlaw', state.theme)}s et le ${roleLabel('renegade', state.theme)} sont éliminés : le ${roleLabel('sheriff', state.theme)} l'emporte.`,
    };
  }

  return null;
}
