// ============================================================================
// Définition du deck BANG! (80 cartes du jeu de base).
//
// Les comptes par carte sont 100% fidèles au cahier des charges. Les faces
// (couleur + valeur) suivent une répartition réaliste sur les 4 couleurs et
// les valeurs 1..13 afin que les jets « tirer ! » (Tonneau = Cœur,
// Dynamite = Pique 2-9, Prison = Cœur) aient des probabilités correctes.
// Ces faces sont des DONNÉES : on peut les remplacer par la liste officielle
// exacte plus tard sans modifier le moteur de jeu.
// ============================================================================

import { Card, CardName, CardColor, CardSuit } from "./types";

interface CardSpec {
	name: CardName;
	color: CardColor;
	count: number;
	isWeapon?: boolean;
	weaponRange?: number;
	unlimitedBang?: boolean;
}

const SPECS: CardSpec[] = [
	// --- Brunes (action) ---
	{ name: "bang", color: "brown", count: 25 },
	{ name: "missed", color: "brown", count: 12 },
	{ name: "beer", color: "brown", count: 6 },
	{ name: "wells_fargo", color: "brown", count: 1 },
	{ name: "stagecoach", color: "brown", count: 2 },
	{ name: "general_store", color: "brown", count: 2 },
	{ name: "indians", color: "brown", count: 2 },
	{ name: "duel", color: "brown", count: 3 },
	{ name: "gatling", color: "brown", count: 1 },
	{ name: "saloon", color: "brown", count: 1 },
	{ name: "cat_balou", color: "brown", count: 4 },
	{ name: "panic", color: "brown", count: 4 },
	// --- Bleues (équipements) ---
	{ name: "barrel", color: "blue", count: 2 },
	{ name: "dynamite", color: "blue", count: 1 },
	{ name: "jail", color: "blue", count: 3 },
	{ name: "mustang", color: "blue", count: 2 },
	{ name: "scope", color: "blue", count: 1 },
	// --- Armes (rouges) ---
	{
		name: "volcanic",
		color: "red",
		count: 2,
		isWeapon: true,
		weaponRange: 1,
		unlimitedBang: true,
	},
	{ name: "schofield", color: "red", count: 3, isWeapon: true, weaponRange: 2 },
	{ name: "remington", color: "red", count: 1, isWeapon: true, weaponRange: 3 },
	{
		name: "rev_carabine",
		color: "red",
		count: 1,
		isWeapon: true,
		weaponRange: 4,
	},
	{
		name: "winchester",
		color: "red",
		count: 1,
		isWeapon: true,
		weaponRange: 5,
	},
];

const SUITS: CardSuit[] = ["hearts", "diamonds", "clubs", "spades"];

/**
 * Construit la liste ordonnée des 80 cartes (non mélangée). Les faces sont
 * réparties de manière déterministe : chaque exemplaire reçoit une
 * (couleur, valeur) en parcourant un compteur global, garantissant une bonne
 * dispersion sur les 4 couleurs et toutes les valeurs.
 */
export function buildDeck(): Card[] {
	const cards: Card[] = [];
	let globalIndex = 0;

	for (const spec of SPECS) {
		for (let i = 0; i < spec.count; i++) {
			const suit = SUITS[globalIndex % 4];
			// Valeurs 1..13 réparties via un pas premier (7) pour éviter les motifs.
			const value = ((globalIndex * 7) % 13) + 1;
			cards.push({
				id: `${spec.name}_${i}`,
				name: spec.name,
				color: spec.color,
				suit,
				value,
				isWeapon: spec.isWeapon,
				weaponRange: spec.weaponRange,
				unlimitedBang: spec.unlimitedBang,
			});
			globalIndex++;
		}
	}

	return cards;
}

/** Vérifie la cohérence : total = 80. */
export function deckSize(): number {
	return SPECS.reduce((sum, s) => sum + s.count, 0);
}
