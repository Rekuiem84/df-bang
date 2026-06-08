// ============================================================================
// RoomManager : cycle de vie des salles, lobby, démarrage, reconnexion.
// ============================================================================

import type { Server, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  Theme,
} from '../../shared/types';
import { MIN_PLAYERS, MAX_PLAYERS } from '../../shared/data';
import { uid, generateRoomCode, normalizePseudo } from './util';
import { setupGame } from './game/setup';
import { GameRoom } from './game/room';
import { buildLobbyView } from './game/view';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const RECONNECT_GRACE_MS = 60_000;

interface Seat {
  id: string;
  pseudo: string;
  socketId: string | null;
  isHost: boolean;
  isConnected: boolean;
  isBot?: boolean;
}

interface Room {
  code: string;
  hostId: string;
  phase: 'lobby' | 'playing' | 'ended';
  seats: Seat[];
  game?: GameRoom;
  reconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Décisions en attente : playerId parti -> id du joueur qui décide. */
  pendingDecisions: Map<string, string>;
  /** Votes d'élimination en cours, indexés par id du joueur visé. */
  votes: Map<string, VoteRecord>;
  /** Timer de destruction quand plus aucun humain n'est connecté. */
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

interface VoteRecord {
  initiatorId: string;
  voters: string[];
  ballots: Map<string, boolean>;
  timer: ReturnType<typeof setTimeout>;
}

const VOTE_MS = 30_000;
/** Délai de grâce avant suppression d'une room sans humain connecté. */
const ROOM_CLEANUP_MS = 120_000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  /** socketId -> { roomCode, playerId } pour retrouver le contexte. */
  private sockets = new Map<string, { roomCode: string; playerId: string }>();

  constructor(private io: IO) {}

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------

  createRoom(socket: ClientSocket, pseudo: string): void {
    const clean = pseudo.trim();
    if (!clean) return this.error(socket, 'Pseudo requis.');

    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const playerId = uid();
    const room: Room = {
      code,
      hostId: playerId,
      phase: 'lobby',
      seats: [
        { id: playerId, pseudo: clean, socketId: socket.id, isHost: true, isConnected: true },
      ],
      reconnectTimers: new Map(),
      pendingDecisions: new Map(),
      votes: new Map(),
    };
    this.rooms.set(code, room);
    this.sockets.set(socket.id, { roomCode: code, playerId });
    socket.join(code);

    socket.emit('joined', { roomCode: code, playerId });
    this.broadcastLobby(room);
  }

  joinRoom(socket: ClientSocket, roomCode: string, pseudo: string): void {
    const code = roomCode.trim().toUpperCase();
    const clean = pseudo.trim();
    const room = this.rooms.get(code);
    if (!room) return this.error(socket, 'Salle introuvable.');
    if (!clean) return this.error(socket, 'Pseudo requis.');

    // Si la partie est lancée, tenter une reconnexion par pseudo.
    if (room.phase !== 'lobby') {
      return this.reconnect(socket, code, clean);
    }

    if (room.seats.length >= MAX_PLAYERS) return this.error(socket, 'Salle pleine.');
    if (room.seats.some((s) => normalizePseudo(s.pseudo) === normalizePseudo(clean))) {
      return this.error(socket, 'Ce pseudo est déjà pris dans la salle.');
    }

    const playerId = uid();
    room.seats.push({ id: playerId, pseudo: clean, socketId: socket.id, isHost: false, isConnected: true });
    this.sockets.set(socket.id, { roomCode: code, playerId });
    socket.join(code);

    socket.emit('joined', { roomCode: code, playerId });
    this.broadcastLobby(room);
  }

  startGame(socket: ClientSocket, roomCode: string, theme: Theme = 'classic'): void {
    const room = this.rooms.get(roomCode);
    if (!room) return this.error(socket, 'Salle introuvable.');
    const ctx = this.sockets.get(socket.id);
    if (!ctx || ctx.playerId !== room.hostId) return this.error(socket, 'Seul l\'hôte peut lancer la partie.');
    const count = room.seats.filter((s) => s.isConnected).length;
    if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
      return this.error(socket, `Il faut ${MIN_PLAYERS} à ${MAX_PLAYERS} joueurs.`);
    }

    const game = setupGame(room.code, room.hostId, room.seats, theme);
    room.game = new GameRoom(this.io, game, (rc) => this.onGameOver(rc));
    room.phase = 'playing';

    this.io.to(room.code).emit('game_started');
    room.game.begin();
  }

  /** L'hôte expulse un joueur du lobby (avant le lancement). */
  kickPlayer(socket: ClientSocket, targetId: string): void {
    const ctx = this.sockets.get(socket.id);
    if (!ctx) return;
    const room = this.rooms.get(ctx.roomCode);
    if (!room || room.phase !== 'lobby') return;
    if (ctx.playerId !== room.hostId) return this.error(socket, 'Seul l\'hôte peut expulser.');
    if (targetId === room.hostId) return; // l'hôte ne s'expulse pas lui-même

    const seat = room.seats.find((s) => s.id === targetId);
    if (!seat) return;
    room.seats = room.seats.filter((s) => s.id !== targetId);

    // Annuler une réservation de slot éventuelle.
    const t = room.reconnectTimers.get(targetId);
    if (t) {
      clearTimeout(t);
      room.reconnectTimers.delete(targetId);
    }

    if (seat.socketId) {
      this.sockets.delete(seat.socketId);
      this.io.to(seat.socketId).emit('kicked', { reason: 'Expulsé par l\'hôte.' });
      const target = this.io.sockets.sockets.get(seat.socketId);
      target?.leave(room.code);
    }
    this.broadcastLobby(room);
  }

  /** DEV : crée une salle remplie de bots et démarre immédiatement la partie. */
  devQuickstart(socket: ClientSocket, pseudo: string, bots = 3, theme: Theme = 'classic'): void {
    const clean = pseudo.trim() || 'Toi';
    const total = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, 1 + bots));

    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const playerId = uid();
    const seats: Seat[] = [
      { id: playerId, pseudo: clean, socketId: socket.id, isHost: true, isConnected: true },
    ];
    for (let i = 1; i < total; i++) {
      seats.push({
        id: uid('bot'),
        pseudo: `Bot ${i}`,
        socketId: null,
        isHost: false,
        isConnected: true,
        isBot: true,
      });
    }

    const room: Room = {
      code,
      hostId: playerId,
      phase: 'playing',
      seats,
      reconnectTimers: new Map(),
      pendingDecisions: new Map(),
      votes: new Map(),
    };
    this.rooms.set(code, room);
    this.sockets.set(socket.id, { roomCode: code, playerId });
    socket.join(code);
    socket.emit('joined', { roomCode: code, playerId });

    const game = setupGame(code, playerId, seats, theme);
    room.game = new GameRoom(this.io, game, (rc) => this.onGameOver(rc));
    this.io.to(code).emit('game_started');
    room.game.begin();
  }

  // -------------------------------------------------------------------------
  // Reconnexion
  // -------------------------------------------------------------------------

  reconnect(socket: ClientSocket, roomCode: string, pseudo: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return this.error(socket, 'Salle introuvable.');

    // Lobby : reconnexion = rejoindre avec le même pseudo si le slot existe.
    if (room.phase === 'lobby') {
      const seat = room.seats.find((s) => normalizePseudo(s.pseudo) === normalizePseudo(pseudo));
      if (!seat) return this.joinRoom(socket, roomCode, pseudo);
      seat.socketId = socket.id;
      seat.isConnected = true;
      this.sockets.set(socket.id, { roomCode, playerId: seat.id });
      socket.join(roomCode);
      socket.emit('joined', { roomCode, playerId: seat.id });
      this.broadcastLobby(room);
      return;
    }

    // Partie en cours : retrouver le joueur par pseudo.
    const game = room.game!;
    const player = game.state.players.find(
      (p) => normalizePseudo(p.pseudo) === normalizePseudo(pseudo),
    );
    if (!player) return this.error(socket, 'Aucun joueur à ce pseudo dans la partie.');

    // Un humain revient : annuler une éventuelle destruction programmée.
    this.cancelCleanup(room);

    const timer = room.reconnectTimers.get(player.id);
    if (timer) {
      clearTimeout(timer);
      room.reconnectTimers.delete(player.id);
    }
    // Le joueur revient : annuler toute décision/vote en attente le concernant.
    const activeVote = room.votes.get(player.id);
    if (activeVote) {
      clearTimeout(activeVote.timer);
      room.votes.delete(player.id);
    }
    if (room.pendingDecisions.has(player.id) || activeVote) {
      room.pendingDecisions.delete(player.id);
      this.io.to(room.code).emit('disconnect_resolved', { playerId: player.id });
    }

    player.socketId = socket.id;
    player.isConnected = true;
    this.sockets.set(socket.id, { roomCode, playerId: player.id });
    socket.join(roomCode);
    socket.emit('joined', { roomCode, playerId: player.id });
    game.broadcast();
  }

  // -------------------------------------------------------------------------
  // Déconnexion
  // -------------------------------------------------------------------------

  handleDisconnect(socket: ClientSocket): void {
    const ctx = this.sockets.get(socket.id);
    this.sockets.delete(socket.id);
    if (!ctx) return;
    const room = this.rooms.get(ctx.roomCode);
    if (!room) return;

    if (room.phase === 'lobby') {
      const seat = room.seats.find((s) => s.id === ctx.playerId);
      if (seat) {
        seat.isConnected = false;
        seat.socketId = null;
        // Réservation 60 s ; sinon retrait du lobby.
        const t = setTimeout(() => {
          room.seats = room.seats.filter((s) => s.id !== ctx.playerId);
          if (room.seats.length === 0) {
            this.rooms.delete(room.code);
            return;
          }
          // Transfert d'hôte si nécessaire.
          if (room.hostId === ctx.playerId) {
            const newHost = room.seats[0];
            room.hostId = newHost.id;
            newHost.isHost = true;
          }
          this.broadcastLobby(room);
        }, RECONNECT_GRACE_MS);
        room.reconnectTimers.set(ctx.playerId, t);
      }
      this.broadcastLobby(room);
      return;
    }

    // Partie en cours : le joueur disparaît → décision par un autre joueur.
    this.handlePlayerGone(room, ctx.playerId);
  }

  /** Quitter volontairement (bouton ⏏). */
  leaveRoom(socket: ClientSocket): void {
    const ctx = this.sockets.get(socket.id);
    if (!ctx) return;
    const room = this.rooms.get(ctx.roomCode);
    this.sockets.delete(socket.id);
    socket.leave(ctx.roomCode);
    if (!room) return;

    if (room.phase === 'lobby') {
      room.seats = room.seats.filter((s) => s.id !== ctx.playerId);
      if (room.seats.length === 0) {
        this.rooms.delete(room.code);
        return;
      }
      if (room.hostId === ctx.playerId) {
        const newHost = room.seats[0];
        room.hostId = newHost.id;
        newHost.isHost = true;
      }
      this.broadcastLobby(room);
      return;
    }

    this.handlePlayerGone(room, ctx.playerId);
  }

  /**
   * Un joueur quitte/disparaît en cours de partie : on le marque déconnecté,
   * on demande à un autre joueur de décider (attendre / éliminer) et on garde
   * une expiration de secours.
   */
  private handlePlayerGone(room: Room, playerId: string): void {
    const game = room.game;
    if (!game || game.state.phase !== 'playing') return;
    const player = game.state.players.find((p) => p.id === playerId);
    if (!player) return;

    player.isConnected = false;
    player.socketId = null;

    // Un joueur déjà éliminé (spectateur) : pas de décision, mais on vérifie
    // quand même s'il faut nettoyer la room.
    if (!player.isAlive) {
      game.broadcast();
      this.maybeScheduleCleanup(room);
      return;
    }

    // Expiration de secours : élimination si personne ne décide à temps.
    const existing = room.reconnectTimers.get(playerId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      room.reconnectTimers.delete(playerId);
      this.resolveDecision(room, playerId, 'eliminate');
    }, RECONNECT_GRACE_MS);
    room.reconnectTimers.set(playerId, t);

    // Si l'hôte s'en va, transférer le statut d'hôte à un humain présent.
    if (playerId === room.hostId) {
      const newHost = game.state.players.find(
        (p) => p.isConnected && !p.isBot && p.id !== playerId,
      );
      if (newHost) {
        room.hostId = newHost.id;
        newHost.isHost = true;
        player.isHost = false;
      }
    }

    // Désigner le décideur : l'hôte s'il est en vie et connecté, sinon un autre.
    const decider = this.pickDecider(room, playerId);
    if (decider && decider.socketId) {
      room.pendingDecisions.set(playerId, decider.id);
      this.io.to(decider.socketId).emit('disconnect_decision', {
        playerId,
        pseudo: player.pseudo,
      });
    }

    game.broadcast();

    // Plus aucun humain connecté → planifier la destruction de la room.
    this.maybeScheduleCleanup(room);
  }

  /** Vrai si au moins un joueur humain est encore connecté. */
  private anyHumanConnected(room: Room): boolean {
    return !!room.game?.state.players.some((p) => !p.isBot && p.isConnected);
  }

  /** Programme la suppression de la room si elle est désormais sans humain. */
  private maybeScheduleCleanup(room: Room): void {
    if (this.anyHumanConnected(room)) return;
    if (room.cleanupTimer) return;
    room.cleanupTimer = setTimeout(() => this.destroyRoom(room), ROOM_CLEANUP_MS);
  }

  private cancelCleanup(room: Room): void {
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = undefined;
    }
  }

  /** Détruit une room et libère tous ses timers. */
  private destroyRoom(room: Room): void {
    if (this.anyHumanConnected(room)) return; // un humain est revenu entre-temps
    for (const t of room.reconnectTimers.values()) clearTimeout(t);
    for (const v of room.votes.values()) clearTimeout(v.timer);
    room.reconnectTimers.clear();
    room.votes.clear();
    room.pendingDecisions.clear();
    room.game?.dispose();
    this.rooms.delete(room.code);
  }

  private pickDecider(room: Room, leaverId: string) {
    const players = room.game!.state.players;
    const host = players.find((p) => p.id === room.hostId);
    if (host && host.isAlive && host.isConnected && host.id !== leaverId && !host.isBot) {
      return host;
    }
    return (
      players.find(
        (p) => p.isAlive && p.isConnected && p.id !== leaverId && !p.isBot,
      ) ?? null
    );
  }

  /** Applique la décision sur un joueur parti. */
  private resolveDecision(room: Room, playerId: string, decision: 'wait' | 'eliminate'): void {
    const timer = room.reconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      room.reconnectTimers.delete(playerId);
    }
    room.pendingDecisions.delete(playerId);

    const game = room.game;
    if (!game || game.state.phase !== 'playing') return;
    const player = game.state.players.find((p) => p.id === playerId);

    if (decision === 'eliminate' && player && player.isAlive && !player.isConnected) {
      game.eliminateDisconnected(playerId);
    } else {
      // « Attendre » : la place reste réservée jusqu'au retour du joueur.
      game.broadcast();
    }
    this.io.to(room.code).emit('disconnect_resolved', { playerId });
  }

  /** Réponse du décideur : « attendre » résout direct, « éliminer » lance le vote. */
  resolveDisconnect(socket: ClientSocket, playerId: string, decision: 'wait' | 'eliminate'): void {
    const ctx = this.sockets.get(socket.id);
    if (!ctx) return;
    const room = this.rooms.get(ctx.roomCode);
    if (!room) return;
    if (room.pendingDecisions.get(playerId) !== ctx.playerId) return; // pas le décideur
    if (decision === 'wait') {
      this.resolveDecision(room, playerId, 'wait');
    } else {
      this.startEliminationVote(room, playerId, ctx.playerId);
    }
  }

  /** Lance un vote de confirmation : élimination si ≥ 50 % de oui. */
  private startEliminationVote(room: Room, targetId: string, initiatorId: string): void {
    const game = room.game;
    if (!game || game.state.phase !== 'playing') return;
    const player = game.state.players.find((p) => p.id === targetId);
    if (!player || !player.isAlive) return;

    room.pendingDecisions.delete(targetId);

    const voters = game.state.players
      .filter((p) => p.isAlive && p.isConnected && !p.isBot && p.id !== targetId)
      .map((p) => p.id);

    // L'expiration de secours est remplacée par le délai du vote.
    const fallback = room.reconnectTimers.get(targetId);
    if (fallback) {
      clearTimeout(fallback);
      room.reconnectTimers.delete(targetId);
    }

    // Un seul votant (le décideur) → élimination directe.
    if (voters.length <= 1) {
      this.resolveDecision(room, targetId, 'eliminate');
      return;
    }

    const ballots = new Map<string, boolean>();
    ballots.set(initiatorId, true); // le décideur vote « oui » d'office
    const timer = setTimeout(() => this.tallyVote(room, targetId), VOTE_MS);
    room.votes.set(targetId, { initiatorId, voters, ballots, timer });

    this.maybeTally(room, targetId);
  }

  castVote(socket: ClientSocket, targetId: string, vote: boolean): void {
    const ctx = this.sockets.get(socket.id);
    if (!ctx) return;
    const room = this.rooms.get(ctx.roomCode);
    if (!room) return;
    const rec = room.votes.get(targetId);
    if (!rec) return;
    if (!rec.voters.includes(ctx.playerId) || rec.ballots.has(ctx.playerId)) return;
    rec.ballots.set(ctx.playerId, vote);
    this.maybeTally(room, targetId);
  }

  /** Dépouille si l'issue est certaine, sinon diffuse l'avancement. */
  private maybeTally(room: Room, targetId: string): void {
    const rec = room.votes.get(targetId);
    if (!rec) return;
    const total = rec.voters.length;
    const needed = Math.ceil(total / 2); // ≥ 50 %
    const yes = [...rec.ballots.values()].filter(Boolean).length;
    const no = rec.ballots.size - yes;
    if (rec.ballots.size >= total || yes >= needed || no > total - needed) {
      this.tallyVote(room, targetId);
    } else {
      this.broadcastVote(room, targetId);
    }
  }

  private broadcastVote(room: Room, targetId: string): void {
    const rec = room.votes.get(targetId);
    const game = room.game;
    if (!rec || !game) return;
    const player = game.state.players.find((p) => p.id === targetId);
    if (!player) return;
    const yes = [...rec.ballots.values()].filter(Boolean).length;
    const total = rec.voters.length;
    for (const voterId of rec.voters) {
      const v = game.state.players.find((p) => p.id === voterId);
      if (v?.socketId) {
        this.io.to(v.socketId).emit('elimination_vote', {
          playerId: targetId,
          pseudo: player.pseudo,
          yes,
          total,
        });
      }
    }
  }

  private tallyVote(room: Room, targetId: string): void {
    const rec = room.votes.get(targetId);
    if (!rec) return;
    clearTimeout(rec.timer);
    room.votes.delete(targetId);
    const yes = [...rec.ballots.values()].filter(Boolean).length;
    const total = rec.voters.length;
    const passed = total > 0 && yes / total >= 0.5;
    this.resolveDecision(room, targetId, passed ? 'eliminate' : 'wait');
  }

  // -------------------------------------------------------------------------
  // Routage des actions de jeu
  // -------------------------------------------------------------------------

  playCard(socket: ClientSocket, cardId: string, targetPlayerId?: string, secondCardId?: string): void {
    const { room, playerId } = this.context(socket) ?? {};
    if (room?.game && playerId) room.game.playCard(playerId, cardId, targetPlayerId, secondCardId);
  }

  respond(
    socket: ClientSocket,
    response: string,
    cardId?: string,
    cardIds?: string[],
    targetPlayerId?: string,
  ): void {
    const { room, playerId } = this.context(socket) ?? {};
    if (room?.game && playerId) {
      room.game.respond(playerId, response, cardId, cardIds, targetPlayerId);
    }
  }

  endTurn(socket: ClientSocket): void {
    const { room, playerId } = this.context(socket) ?? {};
    if (room?.game && playerId) room.game.endTurnRequest(playerId);
  }

  usePower(socket: ClientSocket, power: string, cardIds?: string[]): void {
    const { room, playerId } = this.context(socket) ?? {};
    if (room?.game && playerId) room.game.usePower(playerId, power, cardIds);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private context(socket: ClientSocket): { room: Room; playerId: string } | null {
    const ctx = this.sockets.get(socket.id);
    if (!ctx) return null;
    const room = this.rooms.get(ctx.roomCode);
    if (!room) return null;
    return { room, playerId: ctx.playerId };
  }

  private broadcastLobby(room: Room): void {
    const view = buildLobbyView(room.code, room.hostId, room.seats);
    this.io.to(room.code).emit('room_updated', view);
  }

  private onGameOver(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (room) room.phase = 'ended';
  }

  private error(socket: ClientSocket, message: string): void {
    socket.emit('error', { message });
  }
}
