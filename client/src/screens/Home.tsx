import { useState } from 'react';
import type { GameApi } from '../hooks/useGame';
import type { Theme } from '@shared/types';
import { THEME_LABELS } from '@shared/data';

export function Home({ api }: { api: GameApi }) {
  const [pseudo, setPseudo] = useState(api.pseudo);
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'join'>('menu');
  const [botCount, setBotCount] = useState(3);
  const [devTheme, setDevTheme] = useState<Theme>('classic');

  const canCreate = pseudo.trim().length >= 2;
  const canJoin = canCreate && code.trim().length >= 4;

  return (
    <div className="screen home">
      <h1 className="title">🤠 BANG!</h1>
      <p className="subtitle">Le duel de l'Ouest entre amis</p>

      <label className="field">
        <span>Ton pseudo</span>
        <input
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          placeholder="Lucky Luke"
          maxLength={16}
          autoComplete="off"
        />
      </label>

      {mode === 'menu' ? (
        <div className="stack">
          <button
            className="btn primary"
            disabled={!canCreate}
            onClick={() => api.createRoom(pseudo.trim())}
          >
            Créer une partie
          </button>
          <button
            className="btn"
            disabled={!canCreate}
            onClick={() => setMode('join')}
          >
            Rejoindre une partie
          </button>

          {import.meta.env.DEV && (
            <div className="dev-box">
              <span className="dev-label">Adversaires (bots) — partie de {botCount + 1} joueurs</span>
              <div className="dev-bots">
                {[3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    className={`btn tiny ${botCount === n ? 'primary' : ''}`}
                    onClick={() => setBotCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="dev-bots">
                {(['classic', 'df'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    className={`btn tiny ${devTheme === t ? 'primary' : ''}`}
                    onClick={() => setDevTheme(t)}
                  >
                    {THEME_LABELS[t]}
                  </button>
                ))}
              </div>
              <button
                className="btn dev"
                onClick={() => api.devQuickstart(pseudo.trim() || 'Toi', botCount, devTheme)}
              >
                ⚡ Partie test (vs {botCount} bots)
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="stack">
          <label className="field">
            <span>Code de la salle</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDE"
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>
          <button
            className="btn primary"
            disabled={!canJoin}
            onClick={() => api.joinRoom(code.trim(), pseudo.trim())}
          >
            Rejoindre
          </button>
          <button className="btn ghost" onClick={() => setMode('menu')}>
            Retour
          </button>
        </div>
      )}
    </div>
  );
}
