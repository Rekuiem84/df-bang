// Utilitaires généraux serveur.

let idCounter = 0;

/** Identifiant unique court et monotone (pour joueurs, etc.). */
export function uid(prefix = 'p'): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1 ambigus

export function generateRoomCode(length = 5): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return code;
}

/** Mélange de Fisher-Yates en place. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Normalise un pseudo pour comparaison de reconnexion. */
export function normalizePseudo(pseudo: string): string {
  return pseudo.trim().toLowerCase();
}
