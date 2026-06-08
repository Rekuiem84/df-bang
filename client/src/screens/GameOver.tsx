import { useState } from 'react';
import type { GameApi } from '../hooks/useGame';
import type { CharacterName } from '@shared/types';
import { CHARACTER_LABELS, roleLabel } from '@shared/data';
import { CharacterModal } from '../components/CharacterModal';

export function GameOver({ api }: { api: GameApi }) {
  const over = api.gameOver;
  const [infoChar, setInfoChar] = useState<CharacterName | null>(null);
  if (!over) return <div className="screen">…</div>;

  const winnerIds = new Set(over.winners.map((w) => w.playerId));
  const winnerRole = over.winners[0]?.role;

  return (
    <div className="screen over">
      <h1 className="title">🏆 Partie terminée</h1>
      <p className="win-condition">{over.winCondition}</p>
      {winnerRole && (
        <p className="win-team">
          Vainqueurs : <span className={`role role-${winnerRole}`}>{roleLabel(winnerRole, over.theme)}</span>
        </p>
      )}

      <h3>Révélation des rôles</h3>
      <ul className="reveal-list">
        {over.reveal.map((r) => (
          <li key={r.playerId} className={winnerIds.has(r.playerId) ? 'winner' : ''}>
            <span className="name">{r.pseudo}</span>
            <span className={`role role-${r.role}`}>{roleLabel(r.role, over.theme)}</span>
            <span className="char info" onClick={() => setInfoChar(r.character)}>
              {CHARACTER_LABELS[r.character]} ⓘ
            </span>
            {winnerIds.has(r.playerId) && <span className="badge">🏆</span>}
          </li>
        ))}
      </ul>

      <button className="btn primary" onClick={api.leave}>
        Retour à l'accueil
      </button>

      {infoChar && <CharacterModal character={infoChar} theme={over.theme} onClose={() => setInfoChar(null)} />}
    </div>
  );
}
