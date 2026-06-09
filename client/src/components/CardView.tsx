import type { Card, CardName, Theme } from '@shared/types';
import { cardLabel, cardEffect, SUIT_SYMBOLS, valueLabel } from '@shared/data';

const PLACEHOLDER = '/card-placeholder.jpg';

/**
 * Illustrations disponibles (dans public/). Le nom de fichier ne correspond pas
 * toujours à la clé interne (ex: beer → biere). Les cartes absentes utilisent le
 * placeholder. Les visuels custom (DF, etc.) pourront s'ajouter par thème ici.
 */
const CARD_IMAGES: Record<CardName, string> = {
  // Brunes (actions)
  bang: '/actions/bang.jpg',
  missed: '/actions/rate.jpg',
  beer: '/actions/biere.jpg',
  wells_fargo: '/actions/diligeance.jpg', // Diligence (pioche 3)
  stagecoach: '/actions/convoi.jpg', // Convoi (pioche 2)
  general_store: '/actions/magasin.jpg',
  indians: '/actions/indiens.jpg',
  duel: '/actions/duel.jpg',
  gatling: '/actions/gatling.jpg',
  saloon: '/actions/saloon.jpg',
  cat_balou: '/actions/coup-de-foudre.jpg',
  panic: '/actions/braquage.jpg',
  // Bleues (équipements)
  barrel: '/equipements/planque.jpg',
  dynamite: '/equipements/dynamite.jpg',
  jail: '/equipements/prison.jpg',
  mustang: '/equipements/mustang.jpg',
  scope: '/equipements/lunette.jpg',
  // Armes
  volcanic: '/armes/volcanic.jpg',
  schofield: '/armes/schofield.jpg',
  remington: '/armes/remington.jpg',
  rev_carabine: '/armes/carabine.jpg',
  winchester: '/armes/winchester.jpg',
};

interface Props {
  card: Card;
  theme?: Theme;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  small?: boolean;
  /** Affiche l'image (réservé au détail/aperçu — pas en main ni en défausse). */
  image?: boolean;
}

const RED_SUITS = ['hearts', 'diamonds'];

export function CardView({
  card,
  theme = 'classic',
  onClick,
  selected,
  disabled,
  small,
  image,
}: Props) {
  const red = RED_SUITS.includes(card.suit);
  const classes = [
    'card',
    `card-${card.color}`,
    selected ? 'selected' : '',
    disabled ? 'disabled' : '',
    small ? 'small' : '',
    onClick && !disabled ? 'clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const typeLabel =
    card.color === 'brown' ? 'Action' : card.isWeapon ? `Arme · ${card.weaponRange}` : 'Équip.';

  return (
    <div className={classes} onClick={!disabled ? onClick : undefined}>
      <div className="card-name">{cardLabel(card.name, theme)}</div>

      {/* Image — uniquement sur le détail/aperçu, pas en main ni en défausse.
          Vraie illustration si dispo, sinon placeholder. */}
      {image && !small && (
        <div className="card-img" aria-hidden="true">
          <img
            className="card-img-el"
            src={CARD_IMAGES[card.name] ?? PLACEHOLDER}
            alt=""
            onError={(e) => {
              if (e.currentTarget.src.indexOf(PLACEHOLDER) === -1) e.currentTarget.src = PLACEHOLDER;
            }}
          />
        </div>
      )}

      {!small && <div className="card-effect">{cardEffect(card.name, theme)}</div>}

      <div className="card-foot">
        <span className="card-type">{typeLabel}</span>
        <span className={`card-suit ${red ? 'red' : 'black'}`}>
          {valueLabel(card.value)} {SUIT_SYMBOLS[card.suit]}
        </span>
      </div>
    </div>
  );
}
