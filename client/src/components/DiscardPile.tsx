import type { Card, Theme } from '@shared/types';
import { CardView } from './CardView';

interface Props {
  /** Dernières cartes (la dernière = sommet de la pile). */
  cards: Card[];
  /** Vrai quand une carte est en cours de glisser au-dessus du seuil. */
  armed?: boolean;
  /** Affiche l'aperçu agrandi de la carte du dessus. */
  onPreview?: (card: Card | null) => void;
  theme?: Theme;
}

/** Pile centrale : empile les dernières cartes jouées/défaussées. */
export function DiscardPile({ cards, armed, onPreview, theme = 'classic' }: Props) {
  // On affiche les 4 dernières, la plus récente au sommet.
  const visible = cards.slice(-4);
  const top = cards[cards.length - 1];

  return (
    <div
      className={`discard-pile ${armed ? 'armed' : ''} ${top ? 'clickable' : ''}`}
      onClick={() => {
        if (top) onPreview?.(top);
      }}
    >
      <div className="discard-stack">
        {visible.length === 0 && <div className="discard-empty">Pile</div>}
        {visible.map((c, i) => {
          const fromTop = visible.length - 1 - i; // 0 = sommet
          const rot = (i % 2 === 0 ? 1 : -1) * (fromTop * 3 + 2);
          const offset = fromTop * 4;
          const style: React.CSSProperties = {
            transform: `translate(${offset}px, ${offset}px) rotate(${rot}deg)`,
            zIndex: i,
            opacity: 1 - fromTop * 0.18,
            position: 'absolute',
          };
          return (
            <div key={c.id} className="discard-card" style={style}>
              <CardView card={c} small theme={theme} />
            </div>
          );
        })}
      </div>
      {armed && <div className="discard-drop">Relâche pour jouer</div>}
    </div>
  );
}
