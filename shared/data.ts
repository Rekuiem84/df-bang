// ============================================================================
// Données statiques BANG! : personnages, rôles, libellés de cartes.
// ============================================================================

import { Character, CharacterName, Role, CardName, Theme } from './types';

// ---------------------------------------------------------------------------
// 16 personnages du jeu de base
// ---------------------------------------------------------------------------

export const CHARACTERS: Record<CharacterName, Character> = {
  bart_cassidy: {
    name: 'bart_cassidy',
    baseHp: 4,
    power: 'Chaque fois qu\'il perd un point de vie, il pioche immédiatement 1 carte.',
  },
  black_jack: {
    name: 'black_jack',
    baseHp: 4,
    power: 'Lors de sa pioche, il montre sa 2e carte. Si c\'est ♥ ou ♦, il pioche 1 carte supplémentaire.',
  },
  calamity_janet: {
    name: 'calamity_janet',
    baseHp: 4,
    power: 'Elle peut utiliser les {bang} comme des {missed} et inversement. Jouer un {missed} en guise de {bang} compte comme son {bang} du tour (sauf {volcanic}).',
  },
  el_gringo: {
    name: 'el_gringo',
    baseHp: 3,
    power: 'Chaque fois qu\'un autre joueur lui fait perdre 1 PV, il tire 1 carte au hasard dans sa main (1 par PV perdu). Sauf dégâts de {dynamite}.',
  },
  jesse_jones: {
    name: 'jesse_jones',
    baseHp: 4,
    power: 'Lors de sa pioche, il peut prendre sa 1re carte au hasard dans la main d\'un autre joueur (sinon dans la pioche). La 2e vient de la pioche.',
  },
  jourdonnais: {
    name: 'jourdonnais',
    baseHp: 4,
    power: 'Considéré comme ayant toujours un {barrel} en jeu : ciblé par un {bang}, il « tire ! » et un Cœur annule le tir.',
  },
  kit_carlson: {
    name: 'kit_carlson',
    baseHp: 4,
    power: 'Lors de sa pioche, il regarde les 3 cartes du dessus, en garde 2 et repose la 3e sur la pioche.',
  },
  lucky_duke: {
    name: 'lucky_duke',
    baseHp: 4,
    power: 'Chaque fois qu\'il « tire ! », il retourne les 2 premières cartes et choisit le meilleur résultat. Les 2 sont défaussées.',
  },
  paul_regret: {
    name: 'paul_regret',
    baseHp: 3,
    power: 'Considéré comme ayant toujours un {mustang} en jeu : les autres le voient à +1 de distance.',
  },
  pedro_ramirez: {
    name: 'pedro_ramirez',
    baseHp: 4,
    power: 'Lors de sa pioche, il peut prendre sa 1re carte sur le dessus de la défausse (sinon dans la pioche). La 2e vient de la pioche.',
  },
  rose_doolan: {
    name: 'rose_doolan',
    baseHp: 4,
    power: 'Considérée comme ayant toujours une {scope} en jeu : elle voit les autres à -1 de distance.',
  },
  sid_ketchum: {
    name: 'sid_ketchum',
    baseHp: 4,
    power: 'À tout moment, il peut défausser 2 cartes pour regagner 1 PV (jamais au-dessus de son maximum).',
  },
  slab_the_killer: {
    name: 'slab_the_killer',
    baseHp: 4,
    power: 'Ses {bang} exigent 2 {missed} pour être annulés. Un {barrel} ne compte que pour 1 {missed}.',
  },
  suzy_lafayette: {
    name: 'suzy_lafayette',
    baseHp: 4,
    power: 'Dès qu\'elle n\'a plus aucune carte en main, elle pioche immédiatement 1 carte.',
  },
  vulture_sam: {
    name: 'vulture_sam',
    baseHp: 4,
    power: 'Dès qu\'un joueur est éliminé, Sam récupère toutes les cartes qu\'il avait en main et en jeu.',
  },
  willy_the_kid: {
    name: 'willy_the_kid',
    baseHp: 4,
    power: 'Il peut jouer autant de {bang} qu\'il le désire pendant son tour.',
  },
};

export const CHARACTER_NAMES = Object.keys(CHARACTERS) as CharacterName[];

// ---------------------------------------------------------------------------
// Distribution des rôles selon le nombre de joueurs
// ---------------------------------------------------------------------------

export const ROLE_DISTRIBUTION: Record<number, Role[]> = {
  4: ['sheriff', 'renegade', 'outlaw', 'outlaw'],
  5: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'deputy'],
  6: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy'],
  7: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy', 'deputy'],
  8: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy', 'deputy', 'deputy'],
};

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 8;

// ---------------------------------------------------------------------------
// Libellés FR affichables
// ---------------------------------------------------------------------------

export const THEME_LABELS: Record<Theme, string> = {
  classic: 'Cartes Classiques',
  df: 'Cartes DF',
};

const ROLE_LABELS_BY_THEME: Record<Theme, Record<Role, string>> = {
  classic: {
    sheriff: 'Shérif',
    deputy: 'Adjoint',
    outlaw: 'Hors-la-loi',
    renegade: 'Renégat',
  },
  df: {
    sheriff: 'DF',
    deputy: 'Fondateur',
    outlaw: 'Imposteur',
    renegade: 'Super vilain',
  },
};

const CARD_LABELS_BY_THEME: Record<Theme, Record<CardName, string>> = {
  // Noms français officiels (livret 4e édition FR), corrections incluses.
  classic: {
    bang: 'BANG !',
    missed: 'Raté !',
    beer: 'Bière',
    wells_fargo: 'Diligence', // pioche 3
    stagecoach: 'Convoi', // pioche 2
    general_store: 'Magasin',
    indians: 'Indiens !',
    duel: 'Duel',
    gatling: 'Gatling',
    saloon: 'Saloon',
    cat_balou: 'Coup de foudre',
    panic: 'Braquage !',
    barrel: 'Planque',
    dynamite: 'Dynamite',
    jail: 'Prison',
    mustang: 'Mustang',
    scope: 'Lunette',
    volcanic: 'Volcanic',
    schofield: 'Schofield',
    remington: 'Remington',
    rev_carabine: 'Carabine',
    winchester: 'Winchester',
  },
  df: {
    bang: 'Ratio',
    missed: 'Flop',
    beer: 'Bière',
    wells_fargo: 'Bretagne', // pioche 3
    stagecoach: 'Sospel', // pioche 2
    general_store: 'Courses',
    indians: 'Déferlement de rageux',
    duel: 'One One',
    gatling: 'Drama',
    saloon: 'Verre du Mestre',
    cat_balou: 'Haagrah',
    panic: 'Masterclass',
    barrel: 'Canapé',
    dynamite: 'Pet foireux',
    jail: 'Ban',
    mustang: 'Contre soirée',
    scope: 'Double vue',
    volcanic: 'Bracelet de DF',
    schofield: 'Canne à pêche ZFM',
    remington: 'Ceinture d\'alcool',
    rev_carabine: 'Bouteille du Piao Piao',
    winchester: 'Enceinte Xtreme',
  },
};

export function roleLabel(role: Role, theme: Theme = 'classic'): string {
  return ROLE_LABELS_BY_THEME[theme][role];
}

export function cardLabel(name: CardName, theme: Theme = 'classic'): string {
  return CARD_LABELS_BY_THEME[theme][name];
}

/** Remplace les tokens {cle} d'un texte par les libellés du thème. */
function applyTokens(template: string, theme: Theme): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    if (key in CARD_LABELS_BY_THEME[theme]) return cardLabel(key as CardName, theme);
    if (key in ROLE_LABELS_BY_THEME[theme]) return roleLabel(key as Role, theme);
    return `{${key}}`;
  });
}

export function characterPower(name: CharacterName, theme: Theme = 'classic'): string {
  return applyTokens(CHARACTERS[name].power, theme);
}

/** Effet résumé de chaque carte, affiché directement dessus. */
const CARD_EFFECT_TEMPLATES: Record<CardName, string> = {
  bang: 'Tire sur 1 cible à portée : elle joue {missed} ou perd 1 PV. (1/tour)',
  missed: 'Annule un {bang} qui te vise. (en réaction)',
  beer: 'Rends 1 PV (pas au-delà du max). Inutile à 2 joueurs.',
  wells_fargo: 'Pioche 3 cartes.',
  stagecoach: 'Pioche 2 cartes.',
  general_store: 'Étale 1 carte par joueur ; chacun en prend 1.',
  indians: 'Chaque autre joueur joue un {bang} ou perd 1 PV.',
  duel: 'Échange de {bang} : le 1er qui ne peut plus perd 1 PV.',
  gatling: 'Tire sur tous les autres : chacun joue {missed} ou perd 1 PV.',
  saloon: 'Tous les joueurs en vie regagnent 1 PV.',
  cat_balou: 'Force n\'importe quel joueur à défausser 1 carte.',
  panic: 'Vole 1 carte à un joueur à distance 1.',
  barrel: 'Ciblé par un {bang} : tire ! Un Cœur = esquive.',
  dynamite: 'Début de ton tour : Pique 2-9 → -3 PV, sinon elle passe au voisin.',
  jail: 'Pose sur un joueur (pas le {sheriff}) : Cœur = il joue, sinon tour sauté.',
  mustang: 'Les autres te voient à +1 de distance.',
  scope: 'Tu vois les autres à -1 de distance.',
  volcanic: 'Arme portée 1. {bang} illimités.',
  schofield: 'Arme portée 2.',
  remington: 'Arme portée 3.',
  rev_carabine: 'Arme portée 4.',
  winchester: 'Arme portée 5.',
};

export function cardEffect(name: CardName, theme: Theme = 'classic'): string {
  return applyTokens(CARD_EFFECT_TEMPLATES[name], theme);
}

export const CHARACTER_LABELS: Record<CharacterName, string> = {
  bart_cassidy: 'Bart Cassidy',
  black_jack: 'Black Jack',
  calamity_janet: 'Calamity Janet',
  el_gringo: 'El Gringo',
  jesse_jones: 'Jesse Jones',
  jourdonnais: 'Jourdonnais',
  kit_carlson: 'Kit Carlson',
  lucky_duke: 'Lucky Duke',
  paul_regret: 'Paul Regret',
  pedro_ramirez: 'Pedro Ramirez',
  rose_doolan: 'Rose Doolan',
  sid_ketchum: 'Sid Ketchum',
  slab_the_killer: 'Slab the Killer',
  suzy_lafayette: 'Suzy Lafayette',
  vulture_sam: 'Vulture Sam',
  willy_the_kid: 'Willy the Kid',
};

export const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

/** Affiche une valeur de carte (1=A, 11=J, 12=Q, 13=K). */
export function valueLabel(value: number): string {
  switch (value) {
    case 1:
      return 'A';
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    default:
      return String(value);
  }
}
