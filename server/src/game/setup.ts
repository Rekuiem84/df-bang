// Mise en place d'une partie à partir du lobby.

import { CHARACTERS, CHARACTER_NAMES, ROLE_DISTRIBUTION } from '../../../shared/data';
import { buildDeck } from '../../../shared/cards';
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
 * Construit le GameState initial : assigne rôles + personnages, calcule les PV,
 * distribue la main de départ (= PV) et place le Shérif en premier joueur.
 */
export function setupGame(
  roomCode: string,
  hostId: string,
  seats: LobbySeat[],
  theme: import('../../../shared/types').Theme = 'classic',
): GameState {
  const n = seats.length;
  const roles = shuffle([...ROLE_DISTRIBUTION[n]]);
  const characters = shuffle([...CHARACTER_NAMES]).slice(0, n);

  const deck = shuffle(buildDeck());

  const players: ServerPlayer[] = seats.map((seat, i) => {
    const role = roles[i];
    const character = characters[i];
    const baseHp = CHARACTERS[character].baseHp;
    const maxHp = baseHp + (role === 'sheriff' ? 1 : 0);
    return {
      id: seat.id,
      socketId: seat.socketId,
      pseudo: seat.pseudo,
      role,
      character,
      hp: maxHp,
      maxHp,
      hand: [],
      inPlay: [],
      isAlive: true,
      isConnected: seat.isConnected,
      isHost: seat.isHost,
      isBot: seat.isBot,
    };
  });

  // Main de départ = nombre de PV de chaque joueur.
  for (const p of players) {
    for (let k = 0; k < p.maxHp; k++) {
      const card = deck.pop();
      if (card) p.hand.push(card);
    }
  }

  const sheriffIndex = players.findIndex((p) => p.role === 'sheriff');

  const state: GameState = {
    roomCode,
    theme,
    hostId,
    players,
    deck,
    discardPile: [],
    currentPlayerIndex: sheriffIndex >= 0 ? sheriffIndex : 0,
    phase: 'playing',
    turnPhase: 'draw',
    bangPlayedThisTurn: 0,
    turnCount: 0,
    pendingAction: null,
    log: [],
  };

  return state;
}
