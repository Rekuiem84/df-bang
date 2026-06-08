import type { GameApi } from '../hooks/useGame';

/** Modale demandant au décideur le sort d'un joueur parti. */
export function DecisionModal({ api }: { api: GameApi }) {
  const decision = api.decisions[0];
  if (!decision) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal decision-modal">
        <h3>⚠️ {decision.pseudo} a quitté la partie</h3>
        <p className="muted">Que faire de sa place ?</p>
        <div className="stack">
          <button
            className="btn primary"
            onClick={() => api.resolveDisconnect(decision.playerId, 'wait')}
          >
            ⏳ Il va revenir — garder sa place
          </button>
          <button
            className="btn danger"
            onClick={() => api.resolveDisconnect(decision.playerId, 'eliminate')}
          >
            💀 Il abandonne — l'éliminer
          </button>
        </div>
        <p className="hint">Sans réponse, il sera éliminé automatiquement après 60 s.</p>
      </div>
    </div>
  );
}
