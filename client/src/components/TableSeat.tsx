import type { PublicPlayer, Role, Theme } from '@shared/types';
import { CHARACTER_LABELS, roleLabel, cardLabel, SUIT_SYMBOLS } from '@shared/data';

interface Props {
  player: PublicPlayer;
  isCurrent: boolean;
  theme?: Theme;
  distance?: number;
  selectable?: boolean;
  onSelect?: () => void;
  /** Ouvre la fiche du personnage. */
  onInfo?: () => void;
  /** Rôle deviné/suspecté (note personnelle). */
  guess?: Role;
  /** Fait défiler le rôle deviné. */
  onCycleGuess?: () => void;
}

/** Siège compact d'un autre joueur, positionné autour de la table. */
export function TableSeat({
  player,
  isCurrent,
  theme = 'classic',
  distance,
  selectable,
  onSelect,
  onInfo,
  guess,
  onCycleGuess,
}: Props) {
  const classes = [
    'tseat',
    isCurrent ? 'current' : '',
    !player.isAlive ? 'dead' : '',
    !player.isConnected ? 'offline' : '',
    selectable ? 'selectable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} onClick={selectable ? onSelect : undefined}>
      <div className="tseat-top">
        <span className="tseat-name">{player.pseudo}</span>
        {distance !== undefined && player.isAlive && <span className="tseat-dist">👁️{distance}</span>}
      </div>
      <div className="tseat-sub">
        {player.role && <span className={`role role-${player.role}`}>{roleLabel(player.role, theme)}</span>}
        <span
          className="tseat-char info"
          onClick={(e) => {
            e.stopPropagation();
            onInfo?.();
          }}
        >
          {CHARACTER_LABELS[player.character]} ⓘ
        </span>
      </div>
      <div className="tseat-stats">
        <span className="tseat-hp">{'❤'.repeat(Math.max(0, player.hp))}</span>
        <span className="tseat-hand">🃏{player.handCount}</span>
        {!player.isConnected && <span className="muted">⚠︎</span>}
      </div>
      {player.inPlay.length > 0 && (
        <div className="tseat-equip">
          {player.inPlay.map((c) => (
            <span key={c.id} className={`chip chip-${c.color}`} title={cardLabel(c.name, theme)}>
              {cardLabel(c.name, theme)}
              <small>{SUIT_SYMBOLS[c.suit]}</small>
            </span>
          ))}
        </div>
      )}
      {player.role === null && player.isAlive && onCycleGuess && (
        <div
          className={`tseat-guess ${guess ? `role role-${guess}` : 'empty'}`}
          onClick={(e) => {
            e.stopPropagation();
            onCycleGuess();
          }}
        >
          {guess ? `? ${roleLabel(guess, theme)}` : '? rôle'}
        </div>
      )}
      {!player.isAlive && <div className="tseat-dead">💀</div>}
    </div>
  );
}
