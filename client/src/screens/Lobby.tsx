import { useState } from 'react';
import type { GameApi } from '../hooks/useGame';
import type { Theme } from '@shared/types';
import { THEME_LABELS } from '@shared/data';

export function Lobby({ api }: { api: GameApi }) {
  const lobby = api.lobby;
  const [theme, setTheme] = useState<Theme>('classic');
  if (!lobby) return <div className="screen">Chargement du lobby…</div>;

  const isHost = api.playerId === lobby.hostId;
  const connectedCount = lobby.players.filter((p) => p.isConnected).length;

  return (
    <div className="screen lobby">
      <h2>Salle d'attente</h2>
      <div className="room-code">
        <span className="label">Code</span>
        <span className="code">{lobby.roomCode}</span>
      </div>
      <p className="hint">Partage ce code avec tes amis pour qu'ils rejoignent.</p>

      <ul className="player-list">
        {lobby.players.map((p) => (
          <li key={p.id} className={p.isConnected ? '' : 'offline'}>
            <span className="dot" />
            <span className="name">{p.pseudo}</span>
            {p.isHost && <span className="badge">Hôte</span>}
            {!p.isConnected && <span className="badge muted">déconnecté</span>}
          </li>
        ))}
      </ul>

      <p className="count">
        {connectedCount} / {lobby.maxPlayers} joueurs (min. {lobby.minPlayers})
      </p>

      {isHost && (
        <div className="theme-switch">
          <span className="theme-label">Jeu de cartes</span>
          <div className="theme-options">
            {(['classic', 'df'] as Theme[]).map((t) => (
              <button
                key={t}
                className={`btn tiny ${theme === t ? 'primary' : ''}`}
                onClick={() => setTheme(t)}
              >
                {THEME_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {isHost ? (
        <button className="btn primary" disabled={!lobby.canStart} onClick={() => api.startGame(theme)}>
          {lobby.canStart ? 'Lancer la partie' : `En attente de ${lobby.minPlayers} joueurs`}
        </button>
      ) : (
        <p className="hint">En attente du lancement par l'hôte…</p>
      )}

      <button className="btn ghost" onClick={api.leave}>
        Quitter
      </button>
    </div>
  );
}
