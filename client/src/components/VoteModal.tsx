import type { GameApi } from '../hooks/useGame';

/** Vote de confirmation d'élimination d'un joueur parti. */
export function VoteModal({ api }: { api: GameApi }) {
  const vote = api.votes[0];
  if (!vote) return null;

  const need = Math.ceil(vote.total / 2);

  return (
    <div className="modal-backdrop">
      <div className="modal vote-modal">
        <h3>🗳️ Éliminer {vote.pseudo} ?</h3>
        <p className="vote-tally">
          {vote.yes} / {vote.total} pour l'élimination
          <small> (≥ {need} requis)</small>
        </p>

        {vote.voted ? (
          <p className="muted">Vote enregistré — en attente des autres joueurs…</p>
        ) : (
          <div className="stack">
            <button className="btn danger" onClick={() => api.castVote(vote.playerId, true)}>
              ✅ Oui, l'éliminer
            </button>
            <button className="btn" onClick={() => api.castVote(vote.playerId, false)}>
              ❌ Non, garder sa place
            </button>
          </div>
        )}
        <p className="hint">Sans majorité, sa place est conservée.</p>
      </div>
    </div>
  );
}
