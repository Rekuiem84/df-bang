import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import type {
  LobbyView,
  GameStateView,
  GameOverView,
  Theme,
  CharacterName,
} from '@shared/types';

export interface DisconnectDecision {
  playerId: string;
  pseudo: string;
}

export interface VoteState {
  playerId: string;
  pseudo: string;
  yes: number;
  total: number;
  voted: boolean;
}

const LS_ROOM = 'bang_room';
const LS_PSEUDO = 'bang_pseudo';

export type Screen = 'home' | 'lobby' | 'select' | 'game' | 'over';

export interface GameApi {
  connected: boolean;
  screen: Screen;
  pseudo: string;
  roomCode: string | null;
  playerId: string | null;
  lobby: LobbyView | null;
  game: GameStateView | null;
  gameOver: GameOverView | null;
  error: string | null;
  createRoom: (pseudo: string) => void;
  joinRoom: (roomCode: string, pseudo: string) => void;
  devQuickstart: (pseudo: string, bots?: number, theme?: Theme) => void;
  startGame: (theme?: Theme) => void;
  chooseCharacter: (character: CharacterName) => void;
  kickPlayer: (playerId: string) => void;
  playCard: (cardId: string, targetPlayerId?: string, secondCardId?: string) => void;
  respond: (response: string, cardId?: string) => void;
  respondDraw: (response: string, opts: { cardIds?: string[]; targetPlayerId?: string }) => void;
  endTurn: () => void;
  usePower: (power: string, cardIds?: string[]) => void;
  leave: () => void;
  clearError: () => void;
  decisions: DisconnectDecision[];
  resolveDisconnect: (playerId: string, decision: 'wait' | 'eliminate') => void;
  votes: VoteState[];
  castVote: (playerId: string, vote: boolean) => void;
}

export function useGame(): GameApi {
  const [connected, setConnected] = useState(socket.connected);
  const [screen, setScreen] = useState<Screen>('home');
  const [pseudo, setPseudo] = useState(sessionStorage.getItem(LS_PSEUDO) || '');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [game, setGame] = useState<GameStateView | null>(null);
  const [gameOver, setGameOver] = useState<GameOverView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DisconnectDecision[]>([]);
  const [votes, setVotes] = useState<VoteState[]>([]);
  const votedIds = useRef<Set<string>>(new Set());

  const pseudoRef = useRef(pseudo);
  pseudoRef.current = pseudo;
  // Vrai quand on est réellement dans une salle : empêche d'être ramené dans la
  // partie par une mise à jour en vol après avoir quitté.
  const activeRef = useRef(false);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      // Tentative de reconnexion automatique.
      const savedRoom = sessionStorage.getItem(LS_ROOM);
      const savedPseudo = sessionStorage.getItem(LS_PSEUDO);
      if (savedRoom && savedPseudo) {
        socket.emit('reconnect_player', { roomCode: savedRoom, pseudo: savedPseudo });
      }
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onJoined(payload: { roomCode: string; playerId: string }) {
      activeRef.current = true;
      setRoomCode(payload.roomCode);
      setPlayerId(payload.playerId);
      sessionStorage.setItem(LS_ROOM, payload.roomCode);
      sessionStorage.setItem(LS_PSEUDO, pseudoRef.current);
    }
    function onRoomUpdated(view: LobbyView) {
      if (!activeRef.current) return;
      setLobby(view);
      setScreen((s) => (s === 'game' || s === 'over' ? s : 'lobby'));
    }
    function onGameStarted() {
      if (!activeRef.current) return;
      setGameOver(null);
      setScreen('game');
    }
    function onGameState(view: GameStateView) {
      if (!activeRef.current) return;
      setGame(view);
      setScreen((s) => (s === 'over' ? s : view.phase === 'selecting' ? 'select' : 'game'));
    }
    function onGameOver(payload: GameOverView) {
      if (!activeRef.current) return;
      setGameOver(payload);
      setScreen('over');
    }
    function onDecision(payload: DisconnectDecision) {
      if (!activeRef.current) return;
      setDecisions((d) => (d.some((x) => x.playerId === payload.playerId) ? d : [...d, payload]));
    }
    function onVote(payload: { playerId: string; pseudo: string; yes: number; total: number }) {
      if (!activeRef.current) return;
      const voted = votedIds.current.has(payload.playerId);
      setVotes((vs) => {
        const rest = vs.filter((v) => v.playerId !== payload.playerId);
        return [...rest, { ...payload, voted }];
      });
    }
    function onDecisionResolved(payload: { playerId: string }) {
      votedIds.current.delete(payload.playerId);
      setDecisions((d) => d.filter((x) => x.playerId !== payload.playerId));
      setVotes((vs) => vs.filter((v) => v.playerId !== payload.playerId));
    }
    function onKicked(payload: { reason?: string }) {
      activeRef.current = false;
      sessionStorage.removeItem(LS_ROOM);
      setRoomCode(null);
      setPlayerId(null);
      setLobby(null);
      setGame(null);
      setGameOver(null);
      setDecisions([]);
      setVotes([]);
      setScreen('home');
      setError(payload.reason || 'Tu as été expulsé de la salle.');
    }
    function onError(payload: { message: string }) {
      setError(payload.message);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('joined', onJoined);
    socket.on('room_updated', onRoomUpdated);
    socket.on('game_started', onGameStarted);
    socket.on('game_state_update', onGameState);
    socket.on('game_over', onGameOver);
    socket.on('disconnect_decision', onDecision);
    socket.on('elimination_vote', onVote);
    socket.on('disconnect_resolved', onDecisionResolved);
    socket.on('kicked', onKicked);
    socket.on('error', onError);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('joined', onJoined);
      socket.off('room_updated', onRoomUpdated);
      socket.off('game_started', onGameStarted);
      socket.off('game_state_update', onGameState);
      socket.off('game_over', onGameOver);
      socket.off('disconnect_decision', onDecision);
      socket.off('elimination_vote', onVote);
      socket.off('disconnect_resolved', onDecisionResolved);
      socket.off('kicked', onKicked);
      socket.off('error', onError);
    };
  }, []);

  // Efface l'erreur après 4 s.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const createRoom = useCallback((p: string) => {
    setPseudo(p);
    pseudoRef.current = p;
    sessionStorage.setItem(LS_PSEUDO, p);
    socket.emit('create_room', { pseudo: p });
  }, []);

  const joinRoom = useCallback((code: string, p: string) => {
    setPseudo(p);
    pseudoRef.current = p;
    sessionStorage.setItem(LS_PSEUDO, p);
    socket.emit('join_room', { roomCode: code.toUpperCase(), pseudo: p });
  }, []);

  const startGame = useCallback(
    (theme: Theme = 'classic') => {
      if (roomCode) socket.emit('start_game', { roomCode, theme });
    },
    [roomCode],
  );

  const kickPlayer = useCallback((pid: string) => {
    socket.emit('kick_player', { playerId: pid });
  }, []);

  const chooseCharacter = useCallback((character: CharacterName) => {
    socket.emit('choose_character', { character });
  }, []);

  const devQuickstart = useCallback((p: string, bots = 3, theme: Theme = 'classic') => {
    setPseudo(p);
    pseudoRef.current = p;
    sessionStorage.setItem(LS_PSEUDO, p);
    socket.emit('dev_quickstart', { pseudo: p, bots, theme });
  }, []);

  const playCard = useCallback(
    (cardId: string, targetPlayerId?: string, secondCardId?: string) => {
      socket.emit('play_card', { cardId, targetPlayerId, secondCardId });
    },
    [],
  );

  const respond = useCallback((response: string, cardId?: string) => {
    socket.emit('respond_to_action', { response, cardId });
  }, []);

  const respondDraw = useCallback(
    (response: string, opts: { cardIds?: string[]; targetPlayerId?: string }) => {
      socket.emit('respond_to_action', { response, ...opts });
    },
    [],
  );

  const endTurn = useCallback(() => {
    socket.emit('end_turn', {});
  }, []);

  const usePower = useCallback((power: string, cardIds?: string[]) => {
    socket.emit('use_power', { power, cardIds });
  }, []);

  const leave = useCallback(() => {
    activeRef.current = false; // ignore les mises à jour en vol
    socket.emit('leave_room', {});
    sessionStorage.removeItem(LS_ROOM);
    setRoomCode(null);
    setPlayerId(null);
    setLobby(null);
    setGame(null);
    setGameOver(null);
    setDecisions([]);
    setVotes([]);
    votedIds.current.clear();
    setScreen('home');
  }, []);

  const resolveDisconnect = useCallback((pid: string, decision: 'wait' | 'eliminate') => {
    socket.emit('resolve_disconnect', { playerId: pid, decision });
    // « Éliminer » lance un vote où le décideur a voté oui d'office.
    if (decision === 'eliminate') votedIds.current.add(pid);
    setDecisions((d) => d.filter((x) => x.playerId !== pid));
  }, []);

  const castVote = useCallback((pid: string, vote: boolean) => {
    votedIds.current.add(pid);
    socket.emit('cast_vote', { playerId: pid, vote });
    setVotes((vs) => vs.map((v) => (v.playerId === pid ? { ...v, voted: true } : v)));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    connected,
    screen,
    pseudo,
    roomCode,
    playerId,
    lobby,
    game,
    gameOver,
    error,
    createRoom,
    joinRoom,
    devQuickstart,
    startGame,
    chooseCharacter,
    kickPlayer,
    playCard,
    respond,
    respondDraw,
    endTurn,
    usePower,
    leave,
    clearError,
    decisions,
    resolveDisconnect,
    votes,
    castVote,
  };
}
