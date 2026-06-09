import { useEffect, useState } from 'react';
import type { GameApi } from '../hooks/useGame';
import type { CharacterName } from '@shared/types';
import { CHARACTERS, CHARACTER_LABELS, characterPower } from '@shared/data';

export function CharacterSelect({ api }: { api: GameApi }) {
  const game = api.game;
  const sel = game?.selection ?? null;
  const [pick, setPick] = useState<CharacterName | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!sel) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((sel.deadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [sel?.deadline]);

  if (!game || !sel) return <div className="screen">Chargement…</div>;

  const theme = game.theme;

  const header = (
    <div className="game-header">
      <span className="room-tag">#{game.roomCode}</span>
      <span className="turn-info">Sélection · ⏱ {remaining}s</span>
      <button className="btn ghost tiny" onClick={api.leave}>
        ⏏
      </button>
    </div>
  );

  if (sel.chosen) {
    return (
      <div className="screen select">
        {header}
        <h2>Personnage choisi ✓</h2>
        <p className="hint">
          En attente des autres joueurs… ({sel.remaining} restant{sel.remaining > 1 ? 's' : ''})
        </p>
      </div>
    );
  }

  return (
    <div className="screen select">
      {header}
      <h2>Choisis ton personnage</h2>
      <p className="hint">Tu recevras ta main après le choix.</p>

      <div className="char-choices">
        {sel.options.map((name) => {
          const c = CHARACTERS[name];
          const active = pick === name;
          return (
            <button
              key={name}
              className={`char-card ${active ? 'active' : ''}`}
              onClick={() => setPick(name)}
            >
              <div className="char-img">
                <img className="card-img-el" src="/card-placeholder.jpg" alt="" />
              </div>
              <div className="char-name">{CHARACTER_LABELS[name]}</div>
              <div className="char-hp">
                {'❤'.repeat(c.baseHp)} {c.baseHp}
              </div>
              <div className="char-power">{characterPower(name, theme)}</div>
            </button>
          );
        })}
      </div>

      <button
        className="btn primary"
        disabled={!pick}
        onClick={() => pick && api.chooseCharacter(pick)}
      >
        Valider {pick ? `(${CHARACTER_LABELS[pick]})` : ''}
      </button>
    </div>
  );
}
