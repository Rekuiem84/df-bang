// Mise en place d'une partie à partir du lobby.

import { CHARACTERS, CHARACTER_NAMES, ROLE_DISTRIBUTION } from '../../../shared/data';
import { buildDeck } from '../../../shared/cards';
import { Theme } from '../../../shared/types';
import { shuffle } from '../util';
import { GameState, ServerPlayer } from './state';

interface LobbySeat {
  id: string;
  pseudo: string;
  socketId: string | null;
  isHost: boolean;
  isConnected: boolean;
  isBot?: boolean;
}

/**
 * Construit le GameState en phase de SÉLECTION : assigne les rôles et propose
 * 2 personnages distincts par joueur. Les PV et la main ne sont distribués
 * qu'après le choix (voir finalizeSetup). Le deck est déjà mélangé et conservé.
 */
export function setupSelection(
  roomCode: string,
  hostId: string,
  seats: LobbySeat[],
  theme: Theme = 'classic',
): GameState {
  const n = seats.length;
  const roles = shuffle([...ROLE_DISTRIBUTION[n]]);
  // 2 personnages distincts par joueur (16 persos → suffisant jusqu'à 8 joueurs).
  const pool = shuffle([...CHARACTER_NAMES]);

  const players: ServerPlayer[] = seats.map((seat, i) => {
    const options = pool.slice(i * 2, i * 2 + 2);
    return {
      id: seat.id,
      socketId: seat.socketId,
      pseudo: seat.pseudo,
      role: roles[i],
      character: options[0], // placeholder tant que pas validé
      characterOptions: options,
      characterChosen: false,
      hp: 0,
      maxHp: 0,
      hand: [],
      inPlay: [],
      isAlive: true,
      isConnected: seat.isConnected,
      isHost: seat.isHost,
      isBot: seat.isBot,
    };
  });

  const sheriffIndex = players.findIndex((p) => p.role === 'sheriff');

  return {
    roomCode,
    theme,
    hostId,
    players,
    deck: shuffle(buildDeck()),
    discardPile: [],
    currentPlayerIndex: sheriffIndex >= 0 ? sheriffIndex : 0,
    phase: 'selecting',
    turnPhase: null,
    bangPlayedThisTurn: 0,
    turnCount: 0,
    pendingAction: null,
    log: [],
  };
}

/**
 * Finalise la mise en place une fois tous les personnages choisis : calcule les
 * PV (Shérif +1) et distribue la main de départ (= PV). Passe en phase 'playing'.
 */
export function finalizeSetup(state: GameState): void {
  for (const p of state.players) {
    const baseHp = CHARACTERS[p.character].baseHp;
    p.maxHp = baseHp + (p.role === 'sheriff' ? 1 : 0);
    p.hp = p.maxHp;
    for (let k = 0; k < p.maxHp; k++) {
      const card = state.deck.pop();
      if (card) p.hand.push(card);
    }
  }
  state.phase = 'playing';
  state.turnPhase = 'draw';
}
