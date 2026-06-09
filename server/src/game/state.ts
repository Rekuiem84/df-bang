// État de partie côté serveur (modèle complet, source de vérité).

import { Card, CharacterName, Role, Theme } from '../../../shared/types';

export interface ServerPlayer {
  id: string;
  /** Id de socket courant (peut changer à la reconnexion). */
  socketId: string | null;
  pseudo: string;
  role: Role;
  character: CharacterName;
  /** Les 2 personnages proposés en phase de sélection. */
  characterOptions?: CharacterName[];
  /** Vrai une fois le personnage validé. */
  characterChosen?: boolean;
  hp: number;
  maxHp: number;
  hand: Card[];
  inPlay: Card[];
  isAlive: boolean;
  isConnected: boolean;
  isHost: boolean;
  /** Joueur piloté automatiquement (dev). */
  isBot?: boolean;
  /** Timer de réservation du slot après déconnexion. */
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Action réactive en attente. Modélisée comme une pile pour gérer les
 * enchaînements (ex: Indiens! demande à plusieurs joueurs successivement,
 * un Duel s'imbrique, etc.).
 */
export interface PendingAction {
  type: 'bang' | 'gatling' | 'indians' | 'duel' | 'general_store' | 'draw' | 'discard';
  /** Variante de pioche (Kit/Jesse/Pedro) quand type === 'draw'. */
  drawKind?: 'kit' | 'jesse' | 'pedro';
  /** Joueur source (attaquant / joueur actif). */
  fromPlayerId: string;
  /** File des joueurs dont on attend une réponse (FIFO). */
  awaiting: string[];
  /** Nombre de Missed! requis pour le joueur courant (Slab = 2). */
  missedRequired?: number;
  /** Missed! déjà fournis par le joueur courant. */
  missedProvided?: number;
  /** Cartes étalées pour general_store. */
  storeCards?: Card[];
  /** Pour le duel : qui doit jouer le prochain BANG!. */
  duelTarget?: string;
  duelOther?: string;
  /** Échéance (ms epoch) avant résolution automatique. */
  deadline: number;
  /** Timer associé au timeout. */
  timer?: ReturnType<typeof setTimeout>;
  /** Carte à l'origine (pour la défausse / la résolution). */
  sourceCardId?: string;
}

export type GamePhase = 'lobby' | 'selecting' | 'playing' | 'ended';
export type TurnPhase = 'draw' | 'play' | 'discard';

export interface GameState {
  roomCode: string;
  theme: Theme;
  hostId: string;
  players: ServerPlayer[];
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  phase: GamePhase;
  turnPhase: TurnPhase | null;
  /** BANG! déjà joués ce tour (pour la limite de 1). */
  bangPlayedThisTurn: number;
  /** Numéro du tour courant (1 = 1er tour du Shérif). */
  turnCount: number;
  pendingAction: PendingAction | null;
  /** Phase de sélection : échéance + timer de résolution automatique. */
  selectionDeadline?: number;
  selectionTimer?: ReturnType<typeof setTimeout>;
  /** Journal d'événements (FR), borné aux N derniers. */
  log: string[];
  /** Résultat si la partie est terminée. */
  winners?: { role: Role; playerIds: string[]; condition: string };
}

export function addLog(state: GameState, message: string): void {
  state.log.push(message);
  if (state.log.length > 50) state.log.shift();
}

export function activePlayer(state: GameState): ServerPlayer {
  return state.players[state.currentPlayerIndex];
}

export function getPlayer(state: GameState, id: string): ServerPlayer | undefined {
  return state.players.find((p) => p.id === id);
}

export function alivePlayers(state: GameState): ServerPlayer[] {
  return state.players.filter((p) => p.isAlive);
}
