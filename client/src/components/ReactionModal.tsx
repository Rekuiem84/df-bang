import { useEffect, useState } from 'react';
import type { GameApi } from '../hooks/useGame';
import type { Player, PendingActionView, Theme } from '@shared/types';
import { CardView } from './CardView';
import { cardLabel } from '@shared/data';

interface Props {
  api: GameApi;
  pending: PendingActionView;
  me: Player;
  theme: Theme;
}

/** Cartes utilisables comme Raté! (Calamity Janet : BANG! aussi). */
function missedCards(me: Player) {
  return me.hand.filter(
    (c) => c.name === 'missed' || (c.name === 'bang' && me.character === 'calamity_janet'),
  );
}
/** Cartes utilisables comme BANG! (Calamity Janet : Raté! aussi). */
function bangCards(me: Player) {
  return me.hand.filter(
    (c) => c.name === 'bang' || (c.name === 'missed' && me.character === 'calamity_janet'),
  );
}

export function ReactionModal({ api, pending, me, theme }: Props) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil((pending.deadline - Date.now()) / 1000)));

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((pending.deadline - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(t);
  }, [pending.deadline]);

  return (
    <div className="modal-backdrop">
      <div className="modal reaction">
        <div className="reaction-timer">⏱ {remaining}s</div>
        <h3>{pending.prompt}</h3>

        {(pending.type === 'bang' || pending.type === 'gatling') && (
          <Reaction
            cards={missedCards(me)}
            emptyLabel={`Aucun ${cardLabel('missed', theme)} disponible`}
            actionLabel={`Jouer ${cardLabel('missed', theme)}`}
            onPlay={(id) => api.respond('missed', id)}
            refuse={() => api.respond('take')}
            refuseLabel="Encaisser (-1 PV)"
            note={
              pending.missedRequired && pending.missedRequired > 1
                ? `${pending.missedRequired} ${cardLabel('missed', theme)} requis`
                : undefined
            }
          />
        )}

        {pending.type === 'indians' && (
          <Reaction
            cards={bangCards(me)}
            emptyLabel={`Aucun ${cardLabel('bang', theme)} disponible`}
            actionLabel={`Jouer ${cardLabel('bang', theme)}`}
            onPlay={(id) => api.respond('bang', id)}
            refuse={() => api.respond('take')}
            refuseLabel="Perdre 1 PV"
          />
        )}

        {pending.type === 'duel' && (
          <Reaction
            cards={bangCards(me)}
            emptyLabel={`Aucun ${cardLabel('bang', theme)} disponible`}
            actionLabel={`Riposter (${cardLabel('bang', theme)})`}
            onPlay={(id) => api.respond('bang', id)}
            refuse={() => api.respond('fail')}
            refuseLabel="Abandonner (-1 PV)"
          />
        )}

        {pending.type === 'general_store' && (
          <div className="store">
            {(pending.storeCards ?? []).map((c) => (
              <CardView key={c.id} card={c} theme={theme} onClick={() => api.respond('pick', c.id)} />
            ))}
          </div>
        )}

        {pending.type === 'discard' && (
          <div className="discard-pick">
            <p>Choisis une carte à défausser :</p>
            <div className="hand">
              {me.hand.map((c) => (
                <CardView key={c.id} card={c} theme={theme} onClick={() => api.respond('discard', c.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ReactionProps {
  cards: Player['hand'];
  emptyLabel: string;
  actionLabel: string;
  onPlay: (cardId: string) => void;
  refuse: () => void;
  refuseLabel: string;
  note?: string;
}

function Reaction({ cards, emptyLabel, actionLabel, onPlay, refuse, refuseLabel, note }: ReactionProps) {
  return (
    <div className="reaction-body">
      {note && <p className="reaction-note">{note}</p>}
      {cards.length > 0 ? (
        <div className="hand">
          {cards.map((c) => (
            <CardView key={c.id} card={c} onClick={() => onPlay(c.id)} />
          ))}
        </div>
      ) : (
        <p className="muted">{emptyLabel}</p>
      )}
      <button className="btn danger" onClick={refuse}>
        {refuseLabel}
      </button>
    </div>
  );
}
