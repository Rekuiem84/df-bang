// Test end-to-end : 4 joueurs, démarrage, et déroulement automatique de
// quelques tours (le joueur actif finit son tour, réponses auto aux réactions).
import { io } from 'socket.io-client';

const URL = 'http://localhost:3030';
const PSEUDOS = ['Alice', 'Bob', 'Charlie', 'Dora'];

let roomCode = null;
const clients = [];
let started = false;
let gameOver = false;

function mkClient(pseudo, isHost) {
  const s = io(URL, { transports: ['websocket'] });
  const c = { pseudo, s, playerId: null, state: null };

  s.on('connect', () => {
    if (isHost) s.emit('create_room', { pseudo });
  });
  s.on('joined', ({ roomCode: rc, playerId }) => {
    c.playerId = playerId;
    if (isHost && !roomCode) {
      roomCode = rc;
      // Les autres rejoignent.
      for (let i = 1; i < PSEUDOS.length; i++) {
        clients[i].s.emit('join_room', { roomCode: rc, pseudo: PSEUDOS[i] });
      }
    }
  });
  s.on('room_updated', (lobby) => {
    if (isHost && !started && lobby.players.length === PSEUDOS.length && lobby.canStart) {
      started = true;
      setTimeout(() => s.emit('start_game', { roomCode }), 200);
    }
  });
  s.on('game_state_update', (state) => {
    c.state = state;
    maybeAct(c);
  });
  s.on('action_required', () => maybeAct(c));
  s.on('error', ({ message }) => console.log(`  ⚠️  [${pseudo}] erreur: ${message}`));
  s.on('game_over', (payload) => {
    if (gameOver) return;
    gameOver = true;
    console.log('\n🏆 GAME OVER:', payload.winCondition);
    console.log('Vainqueurs:', payload.winners.map((w) => `${w.pseudo}(${w.role})`).join(', '));
    setTimeout(() => {
      clients.forEach((cl) => cl.s.close());
      process.exit(0);
    }, 300);
  });

  return c;
}

let actions = 0;
const MAX_ACTIONS = 2000;

function maybeAct(c) {
  if (gameOver) return;
  const st = c.state;
  if (!st || st.phase !== 'playing') return;
  if (actions++ > MAX_ACTIONS) {
    console.log('⛔ Trop d’actions, arrêt.');
    process.exit(1);
  }

  const pa = st.pendingAction;
  // Répondre à une action en attente adressée à moi.
  if (pa && pa.awaitingPlayerId === st.me.id) {
    setTimeout(() => respond(c, pa), 30 + Math.random() * 40);
    return;
  }

  // Si c'est mon tour et phase de jeu : finir le tour (stratégie minimale).
  if (st.currentPlayerId === st.me.id && st.turnPhase === 'play' && !pa) {
    // Optionnel : jouer un BANG! sur une cible à portée de temps en temps.
    setTimeout(() => {
      const me = st.me;
      const bang = me.hand.find((x) => x.name === 'bang');
      const targets = st.players.filter((p) => p.isAlive && (st.distances[p.id] ?? 99) <= 1);
      if (bang && targets.length && Math.random() < 0.8 && st.canPlayBang) {
        c.s.emit('play_card', { cardId: bang.id, targetPlayerId: targets[0].id });
      }
      setTimeout(() => c.s.emit('end_turn', {}), 60);
    }, 40);
  }
}

function respond(c, pa) {
  const me = c.state.me;
  if (pa.awaitingPlayerId !== me.id) return;
  switch (pa.type) {
    case 'bang': {
      const missed = me.hand.find((x) => x.name === 'missed');
      if (missed && Math.random() < 0.7) c.s.emit('respond_to_action', { response: 'missed', cardId: missed.id });
      else c.s.emit('respond_to_action', { response: 'take' });
      break;
    }
    case 'indians':
    case 'duel': {
      const bang = me.hand.find((x) => x.name === 'bang');
      if (bang) c.s.emit('respond_to_action', { response: 'bang', cardId: bang.id });
      else c.s.emit('respond_to_action', { response: pa.type === 'duel' ? 'fail' : 'take' });
      break;
    }
    case 'general_store': {
      const card = pa.storeCards?.[0];
      c.s.emit('respond_to_action', { response: 'pick', cardId: card?.id });
      break;
    }
    case 'discard': {
      c.s.emit('respond_to_action', { response: 'discard', cardId: me.hand[0]?.id });
      break;
    }
  }
}

for (let i = 0; i < PSEUDOS.length; i++) {
  clients.push(mkClient(PSEUDOS[i], i === 0));
}

setTimeout(() => {
  console.log('⏰ Timeout global atteint sans fin de partie.');
  process.exit(gameOver ? 0 : 2);
}, 25000);
