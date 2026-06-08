import type { Card, Theme } from '@shared/types';
import { cardLabel, cardEffect, SUIT_SYMBOLS, valueLabel } from '@shared/data';

interface Props {
  card: Card;
  theme?: Theme;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  small?: boolean;
}

const RED_SUITS = ['hearts', 'diamonds'];

export function CardView({ card, theme = 'classic', onClick, selected, disabled, small }: Props) {
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

  return (
    <div className={classes} onClick={!disabled ? onClick : undefined}>
      <div className="card-top">
        <span className="card-name">{cardLabel(card.name, theme)}</span>
        <span className={`card-suit ${red ? 'red' : 'black'}`}>
          {valueLabel(card.value)}
          {SUIT_SYMBOLS[card.suit]}
        </span>
      </div>
      {!small && <div className="card-effect">{cardEffect(card.name, theme)}</div>}
      <div className="card-foot">
        {card.isWeapon && <span className="card-range">Portée {card.weaponRange}</span>}
        <span className="card-type">
          {card.color === 'brown' ? 'Action' : card.isWeapon ? 'Arme' : 'Équip.'}
        </span>
      </div>
    </div>
  );
}
