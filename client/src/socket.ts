import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@shared/types';

// En prod, VITE_SERVER_URL pointe vers le backend Render.
// En dev, on laisse l'URL vide : Socket.io se connecte à la même origine que la
// page (localhost, IP LAN, ou domaine de tunnel) et Vite relaie /socket.io vers
// le backend (voir le proxy dans vite.config.ts). Un seul port à exposer.
const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || undefined;

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: GameSocket = io(SERVER_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});
