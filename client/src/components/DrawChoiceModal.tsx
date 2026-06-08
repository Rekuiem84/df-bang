import { useState } from 'react';
import type { GameApi } from '../hooks/useGame';
import type { GameStateView, PendingActionView, Theme } from '@shared/types';
import { CardView } from './CardView';

interface Props {
  api: GameApi;
  pending: PendingActionView;
  game: GameStateView;
  theme: Theme;
}

/** Choix de pioche pour Kit Carlson / Jesse Jones / Pedro Ramirez. */
export function DrawChoiceModal({ api, pending, game, theme }: Props) {
  const [sel, setSel] = useState<string[]>([]);

  // ---- Kit Carlson : garder 2 des 3 cartes ----
  if (pending.drawKind === 'kit') {
    const cards = pending.storeCards ?? [];
    function toggle(id: string) {
      setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : s));
    }
    return (
      <div className="modal-backdrop">
        <div className="modal draw-modal">
          <h3>Kit Carlson</h3>
          <p className="muted">Garde 2 cartes (la 3ᵉ repart sur la pioche).</p>
          <div className="store">
            {cards.map((c) => (
              <CardView
                key={c.id}
                card={c}
                theme={theme}
                selected={sel.includes(c.id)}
                onClick={() => toggle(c.id)}
              />
            ))}
          </div>
          <button
            className="btn primary"
            disabled={sel.length !== 2}
            onClick={() => api.respondDraw('kit', { cardIds: sel })}
          >
            Garder ces 2 cartes
          </button>
        </div>
      </div>
    );
  }

  // ---- Pedro Ramirez : pioche ou défausse ----
  if (pending.drawKind === 'pedro') {
    return (
      <div className="modal-backdrop">
        <div className="modal draw-modal">
          <h3>Pedro Ramirez</h3>
          <p className="muted">D'où vient ta 1ʳᵉ carte ? (la 2ᵉ vient de la pioche)</p>
          <div className="draw-options">
            <button className="btn" onClick={() => api.respondDraw('deck', {})}>
              🂠 Pioche
            </button>
            {game.discardTop && (
              <button className="btn" onClick={() => api.respondDraw('discard', {})}>
                ♻️ Défausse (carte du dessus)
              </button>
            )}
          </div>
          {game.discardTop && (
            <div className="store">
              <CardView card={game.discardTop} theme={theme} small />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Jesse Jones : pioche ou main d'un joueur ----
  const targets = game.players.filter((p) => p.isAlive && p.handCount > 0);
  return (
    <div className="modal-backdrop">
      <div className="modal draw-modal">
        <h3>Jesse Jones</h3>
        <p className="muted">Ta 1ʳᵉ carte : pioche, ou au hasard dans la main d'un joueur.</p>
        <div className="draw-options">
          <button className="btn" onClick={() => api.respondDraw('deck', {})}>
            🂠 Piocher
          </button>
          {targets.map((p) => (
            <button
              key={p.id}
              className="btn"
              onClick={() => api.respondDraw('steal', { targetPlayerId: p.id })}
            >
              🃏 Voler à {p.pseudo} ({p.handCount})
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
