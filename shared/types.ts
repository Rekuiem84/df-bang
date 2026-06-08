// ============================================================================
// Types partagés entre le serveur et le client (BANG! web)
// Source de vérité unique. Importé via alias `@shared` côté client et chemin
// relatif côté serveur.
// ============================================================================

// ---------------------------------------------------------------------------
// Cartes
// ---------------------------------------------------------------------------

export type CardSuit = "hearts" | "diamonds" | "clubs" | "spades";

/** Couleur de dos / catégorie de carte. */
export type CardColor = "brown" | "blue" | "red";

/** Identifiant logique d'une carte (indépendant de l'exemplaire). */
export type CardName =
	// Brunes
	| "bang"
	| "missed"
	| "beer"
	| "wells_fargo"
	| "stagecoach"
	| "general_store"
	| "indians"
	| "duel"
	| "gatling"
	| "saloon"
	| "cat_balou"
	| "panic"
	// Bleues (équipements)
	| "barrel"
	| "dynamite"
	| "jail"
	| "mustang"
	| "scope"
	// Armes (rouges)
	| "volcanic"
	| "schofield"
	| "remington"
	| "rev_carabine"
	| "winchester";

export interface Card {
	/** Identifiant unique de l'exemplaire (ex: "bang_12"). */
	id: string;
	name: CardName;
	color: CardColor;
	suit: CardSuit;
	/** Valeur de la carte : 1 (As) à 13 (Roi). */
	value: number;
	/** Vrai pour une arme (sous-ensemble des cartes bleues). */
	isWeapon?: boolean;
	/** Portée de l'arme si c'est une arme. */
	weaponRange?: number;
	/** BANG! illimités (Volcanic). */
	unlimitedBang?: boolean;
}

// ---------------------------------------------------------------------------
// Rôles & personnages
// ---------------------------------------------------------------------------

export type Role = "sheriff" | "deputy" | "outlaw" | "renegade";

/** Jeu de noms (et plus tard d'images) des cartes. */
export type Theme = "classic" | "df";

export type CharacterName =
	| "bart_cassidy"
	| "black_jack"
	| "calamity_janet"
	| "el_gringo"
	| "jesse_jones"
	| "jourdonnais"
	| "kit_carlson"
	| "lucky_duke"
	| "paul_regret"
	| "pedro_ramirez"
	| "rose_doolan"
	| "sid_ketchum"
	| "slab_the_killer"
	| "suzy_lafayette"
	| "vulture_sam"
	| "willy_the_kid";

export interface Character {
	name: CharacterName;
	/** Nombre de balles (PV de base). */
	baseHp: number;
	/** Libellé affichable du pouvoir. */
	power: string;
}

// ---------------------------------------------------------------------------
// Joueurs
// ---------------------------------------------------------------------------

export interface Player {
	id: string;
	pseudo: string;
	role: Role;
	character: CharacterName;
	hp: number;
	maxHp: number;
	hand: Card[];
	inPlay: Card[];
	isAlive: boolean;
	isConnected: boolean;
	isHost: boolean;
}

/**
 * Vue publique d'un joueur telle que vue par les autres : pas de main détaillée
 * (seulement le nombre de cartes), rôle masqué tant que vivant (sauf Sheriff).
 */
export interface PublicPlayer {
	id: string;
	pseudo: string;
	/** Rôle visible : sheriff dès le départ, sinon révélé à l'élimination. */
	role: Role | null;
	character: CharacterName;
	hp: number;
	maxHp: number;
	handCount: number;
	inPlay: Card[];
	isAlive: boolean;
	isConnected: boolean;
	isHost: boolean;
	/** Distance « apparente » (équipements + arme) — calculée côté serveur. */
}

// ---------------------------------------------------------------------------
// Phases & état de partie
// ---------------------------------------------------------------------------

export type GamePhase = "lobby" | "playing" | "ended";

/** Phase à l'intérieur d'un tour. */
export type TurnPhase = "draw" | "play" | "discard";

// ---------------------------------------------------------------------------
// Actions en attente (réactivité)
// ---------------------------------------------------------------------------

export type PendingActionType =
	| "bang" // une cible doit jouer Missed!
	| "gatling" // chaque autre joueur doit jouer Missed!
	| "indians" // jouer un BANG! ou perdre 1 PV
	| "duel" // répondre par un BANG! ou perdre 1 PV
	| "general_store" // choisir une carte étalée
	| "draw" // choix de pioche (Kit Carlson / Jesse Jones / Pedro Ramirez)
	| "discard"; // défausser des cartes (fin de tour si main > PV)

/** Variante de choix de pioche selon le personnage. */
export type DrawKind = "kit" | "jesse" | "pedro";

export interface PendingActionOption {
	cardId?: string;
	label: string;
	value: string;
}

/**
 * Représente une demande de réaction adressée à un ou plusieurs joueurs.
 * Visible par le client uniquement pour le(s) joueur(s) concerné(s).
 */
export interface PendingActionView {
	type: PendingActionType;
	/** Joueur à l'origine de l'action (attaquant / joueur actif). */
	fromPlayerId: string;
	/** Joueur dont on attend la réponse maintenant. */
	awaitingPlayerId: string;
	/** Nombre de Missed! requis (Slab the Killer = 2). */
	missedRequired?: number;
	/** Cartes étalées (general_store) ou les 3 cartes vues par Kit Carlson. */
	storeCards?: Card[];
	/** Variante de choix de pioche (type === 'draw'). */
	drawKind?: DrawKind;
	/** Texte d'aide. */
	prompt: string;
	/** Échéance Unix (ms) avant réponse automatique. */
	deadline: number;
}

// ---------------------------------------------------------------------------
// Vue d'état envoyée au client (par joueur)
// ---------------------------------------------------------------------------

export interface GameStateView {
	roomCode: string;
	theme: Theme;
	phase: GamePhase;
	/** Soi-même, vue complète. */
	me: Player | null;
	/** Les autres joueurs, vue publique, dans l'ordre du cercle. */
	players: PublicPlayer[];
	currentPlayerId: string | null;
	turnPhase: TurnPhase | null;
	deckCount: number;
	discardTop: Card | null;
	/** Dernières cartes jouées/défaussées (la dernière = sommet de la pile). */
	discardRecent: Card[];
	/** Toute la défausse, dans l'ordre où les cartes y ont été posées. */
	discardAll: Card[];
	pendingAction: PendingActionView | null;
	/** Distances depuis « me » vers chaque autre joueur (id -> distance). */
	distances: Record<string, number>;
	/** Indique si « me » peut encore jouer un BANG! ce tour. */
	canPlayBang: boolean;
	log: string[];
}

export interface LobbyPlayer {
	id: string;
	pseudo: string;
	isHost: boolean;
	isConnected: boolean;
}

export interface LobbyView {
	roomCode: string;
	players: LobbyPlayer[];
	hostId: string;
	canStart: boolean;
	minPlayers: number;
	maxPlayers: number;
}

// ---------------------------------------------------------------------------
// Résultat de fin de partie
// ---------------------------------------------------------------------------

export interface GameOverView {
	theme: Theme;
	winners: Array<{ playerId: string; pseudo: string; role: Role }>;
	winCondition: string;
	/** Révélation de tous les rôles. */
	reveal: Array<{
		playerId: string;
		pseudo: string;
		role: Role;
		character: CharacterName;
	}>;
}

// ---------------------------------------------------------------------------
// Contrats Socket.io
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
	create_room: (payload: { pseudo: string }) => void;
	join_room: (payload: { roomCode: string; pseudo: string }) => void;
	start_game: (payload: { roomCode: string; theme?: Theme }) => void;
	kick_player: (payload: { playerId: string }) => void;
	play_card: (payload: {
		cardId: string;
		targetPlayerId?: string;
		secondCardId?: string;
	}) => void;
	respond_to_action: (payload: {
		response: string;
		cardId?: string;
		cardIds?: string[];
		targetPlayerId?: string;
	}) => void;
	end_turn: (payload: Record<string, never>) => void;
	reconnect_player: (payload: { roomCode: string; pseudo: string }) => void;
	use_power: (payload: { power: string; cardIds?: string[] }) => void;
	/** Quitter la partie/salle en cours volontairement. */
	leave_room: (payload: Record<string, never>) => void;
	/** Décision sur un joueur parti : attendre son retour ou lancer le vote. */
	resolve_disconnect: (payload: {
		playerId: string;
		decision: "wait" | "eliminate";
	}) => void;
	/** Vote de confirmation d'élimination d'un joueur parti. */
	cast_vote: (payload: { playerId: string; vote: boolean }) => void;
	/** DEV uniquement : crée une partie remplie de bots et la démarre. */
	dev_quickstart: (payload: {
		pseudo: string;
		bots?: number;
		theme?: Theme;
	}) => void;
}

export interface ServerToClientEvents {
	room_updated: (lobby: LobbyView) => void;
	game_started: () => void;
	game_state_update: (state: GameStateView) => void;
	action_required: (action: PendingActionView) => void;
	player_eliminated: (payload: {
		playerId: string;
		pseudo: string;
		role: Role;
	}) => void;
	game_over: (payload: GameOverView) => void;
	/** Le joueur a été expulsé du lobby par l'hôte. */
	kicked: (payload: { reason?: string }) => void;
	error: (payload: { message: string }) => void;
	/** Confirmation de création/jonction avec l'id de session. */
	joined: (payload: { roomCode: string; playerId: string }) => void;
	/** Un joueur est parti : le destinataire doit décider de son sort. */
	disconnect_decision: (payload: { playerId: string; pseudo: string }) => void;
	/** Vote d'élimination en cours : état à afficher aux votants. */
	elimination_vote: (payload: {
		playerId: string;
		pseudo: string;
		yes: number;
		total: number;
	}) => void;
	/** La situation d'un joueur parti est résolue (fermer la modale/le vote). */
	disconnect_resolved: (payload: { playerId: string }) => void;
}
