// Point d'entrée du serveur BANG! : Express + Socket.io.

import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/types';
import { RoomManager } from './rooms';

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

app.get('/', (_req, res) => {
  res.json({ status: 'ok', game: 'BANG!', ts: Date.now() });
});
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

const manager = new RoomManager(io);

io.on('connection', (socket) => {
  socket.on('create_room', ({ pseudo }) => manager.createRoom(socket, pseudo));
  socket.on('join_room', ({ roomCode, pseudo }) => manager.joinRoom(socket, roomCode, pseudo));
  socket.on('reconnect_player', ({ roomCode, pseudo }) => manager.reconnect(socket, roomCode, pseudo));
  socket.on('start_game', ({ roomCode, theme }) => manager.startGame(socket, roomCode, theme));
  socket.on('kick_player', ({ playerId }) => manager.kickPlayer(socket, playerId));
  socket.on('dev_quickstart', ({ pseudo, bots, theme }) =>
    manager.devQuickstart(socket, pseudo, bots, theme),
  );

  socket.on('play_card', ({ cardId, targetPlayerId, secondCardId }) =>
    manager.playCard(socket, cardId, targetPlayerId, secondCardId),
  );
  socket.on('respond_to_action', ({ response, cardId, cardIds, targetPlayerId }) =>
    manager.respond(socket, response, cardId, cardIds, targetPlayerId),
  );
  socket.on('end_turn', () => manager.endTurn(socket));
  socket.on('use_power', ({ power, cardIds }) => manager.usePower(socket, power, cardIds));
  socket.on('leave_room', () => manager.leaveRoom(socket));
  socket.on('resolve_disconnect', ({ playerId, decision }) =>
    manager.resolveDisconnect(socket, playerId, decision),
  );
  socket.on('cast_vote', ({ playerId, vote }) => manager.castVote(socket, playerId, vote));

  socket.on('disconnect', () => manager.handleDisconnect(socket));
});

httpServer.listen(PORT, () => {
  console.log(`🤠 Serveur BANG! à l'écoute sur le port ${PORT}`);
});
