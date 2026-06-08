import type { CharacterName, Theme } from '@shared/types';
import { CHARACTERS, CHARACTER_LABELS, characterPower } from '@shared/data';

interface Props {
  character: CharacterName;
  theme?: Theme;
  onClose: () => void;
}

/** Fiche détaillée d'un personnage (nom, PV de base, pouvoir). */
export function CharacterModal({ character, theme = 'classic', onClose }: Props) {
  const c = CHARACTERS[character];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal character-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{CHARACTER_LABELS[character]}</h3>
        <div className="char-hp">{'❤'.repeat(c.baseHp)} {c.baseHp} PV de base</div>
        <p className="char-power">{characterPower(character, theme)}</p>
        <button className="btn primary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}
