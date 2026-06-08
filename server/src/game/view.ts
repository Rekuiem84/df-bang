// Construction de la vue d'état spécifique à un joueur (filtrage des infos).

import {
  GameStateView,
  Player,
  PublicPlayer,
  PendingActionView,
  LobbyView,
} from '../../../shared/types';
import { MIN_PLAYERS, MAX_PLAYERS, cardLabel } from '../../../shared/data';
import { Theme } from '../../../shared/types';
import { GameState, ServerPlayer, PendingAction } from './state';
import { distanceMap } from './distance';
import { discardTop } from './deck';
import { canPlayerPlayBang } from './rules';

function toSelf(p: ServerPlayer): Player {
  return {
    id: p.id,
    pseudo: p.pseudo,
    role: p.role,
    character: p.character,
    hp: p.hp,
    maxHp: p.maxHp,
    hand: p.hand,
    inPlay: p.inPlay,
    isAlive: p.isAlive,
    isConnected: p.isConnected,
    isHost: p.isHost,
  };
}

function toPublic(p: ServerPlayer): PublicPlayer {
  // Rôle visible : Shérif toujours, autres seulement si morts.
  const roleVisible = p.role === 'sheriff' || !p.isAlive;
  return {
    id: p.id,
    pseudo: p.pseudo,
    role: roleVisible ? p.role : null,
    character: p.character,
    hp: p.hp,
    maxHp: p.maxHp,
    handCount: p.hand.length,
    inPlay: p.inPlay,
    isAlive: p.isAlive,
    isConnected: p.isConnected,
    isHost: p.isHost,
  };
}

function toPendingView(pa: PendingAction, viewerId: string, theme: Theme): PendingActionView | null {
  // Visible seulement si le viewer est concerné maintenant.
  const awaitingNow = pa.awaiting[0];
  if (awaitingNow !== viewerId) return null;

  let prompt = '';
  switch (pa.type) {
    case 'bang':
      prompt = `Vous êtes la cible d'un ${cardLabel('bang', theme)} ! Jouez ${pa.missedRequired ?? 1} ${cardLabel('missed', theme)}`;
      break;
    case 'gatling':
      prompt = `${cardLabel('gatling', theme)} ! Jouez ${cardLabel('missed', theme)} ou perdez 1 PV.`;
      break;
    case 'indians':
      prompt = `${cardLabel('indians', theme)} ! Jouez un ${cardLabel('bang', theme)} ou perdez 1 PV.`;
      break;
    case 'duel':
      prompt = `${cardLabel('duel', theme)} ! Jouez un ${cardLabel('bang', theme)} ou perdez 1 PV.`;
      break;
    case 'general_store':
      prompt = `${cardLabel('general_store', theme)} : choisissez une carte.`;
      break;
    case 'draw':
      if (pa.drawKind === 'kit') prompt = 'Kit Carlson : gardez 2 des 3 cartes.';
      else if (pa.drawKind === 'jesse') prompt = 'Jesse Jones : 1re carte — pioche ou main d\'un joueur ?';
      else prompt = 'Pedro Ramirez : 1re carte — pioche ou défausse ?';
      break;
    case 'discard':
      prompt = 'Défaussez jusqu\'à avoir autant de cartes que de PV.';
      break;
  }

  return {
    type: pa.type,
    fromPlayerId: pa.fromPlayerId,
    awaitingPlayerId: awaitingNow,
    missedRequired: pa.missedRequired,
    storeCards: pa.storeCards,
    drawKind: pa.drawKind,
    prompt,
    deadline: pa.deadline,
  };
}

export function buildView(state: GameState, viewerId: string): GameStateView {
  const me = state.players.find((p) => p.id === viewerId) ?? null;
  const others = state.players
    .filter((p) => p.id !== viewerId)
    .map(toPublic);

  const current = state.players[state.currentPlayerIndex];

  return {
    roomCode: state.roomCode,
    theme: state.theme,
    phase: state.phase,
    me: me ? toSelf(me) : null,
    players: others,
    currentPlayerId: current?.id ?? null,
    turnPhase: state.turnPhase,
    deckCount: state.deck.length,
    discardTop: discardTop(state),
    discardRecent: state.discardPile.slice(-6),
    discardAll: state.discardPile,
    pendingAction: state.pendingAction ? toPendingView(state.pendingAction, viewerId, state.theme) : null,
    distances: me ? distanceMap(state, viewerId) : {},
    canPlayBang: me ? canPlayerPlayBang(state, me) : false,
    log: state.log,
  };
}

export function buildLobbyView(
  roomCode: string,
  hostId: string,
  seats: Array<{ id: string; pseudo: string; isHost: boolean; isConnected: boolean }>,
): LobbyView {
  const count = seats.filter((s) => s.isConnected).length;
  return {
    roomCode,
    players: seats.map((s) => ({
      id: s.id,
      pseudo: s.pseudo,
      isHost: s.isHost,
      isConnected: s.isConnected,
    })),
    hostId,
    canStart: count >= MIN_PLAYERS && count <= MAX_PLAYERS,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
  };
}
