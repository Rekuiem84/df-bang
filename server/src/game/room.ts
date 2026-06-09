// ============================================================================
// GameRoom : orchestrateur runtime d'une partie. Détient le GameState, le
// serveur Socket.io, gère les timers, la machine à états réactive et diffuse
// les vues par joueur.
// ============================================================================

import type { Server } from 'socket.io';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  GameOverView,
  Card,
  CharacterName,
} from '../../../shared/types';
import { roleLabel, cardLabel as cardLabelOf } from '../../../shared/data';
import { finalizeSetup } from './setup';
import {
  GameState,
  ServerPlayer,
  PendingAction,
  activePlayer,
  getPlayer,
  alivePlayers,
  addLog,
} from './state';
import { buildView } from './view';
import { drawCard, drawCards, discard, drawCheck } from './deck';
import { dealDamage, heal, eliminate, checkWinConditions } from './effects';
import { canUseBeer, canUseAsMissed, canUseAsBang } from './rules';
import { isInRange, distanceBetween, hasEquipment } from './distance';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const RESPONSE_TIMEOUT_MS = 30_000;
const SELECTION_TIMEOUT_MS = 30_000;

/** Équipements bleus dont un seul exemplaire est autorisé par joueur. */
const UNIQUE_BLUE = ['barrel', 'mustang', 'scope'];

export class GameRoom {
  private botTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public io: IO,
    public state: GameState,
    private onGameOver?: (roomCode: string) => void,
  ) {}

  // -------------------------------------------------------------------------
  // Diffusion
  // -------------------------------------------------------------------------

  /** Libère les timers internes (à appeler avant de détruire la room). */
  dispose(): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    if (this.state.pendingAction?.timer) clearTimeout(this.state.pendingAction.timer);
    this.state.pendingAction = null;
    if (this.state.selectionTimer) clearTimeout(this.state.selectionTimer);
    this.state.selectionTimer = undefined;
  }

  /** Le joueur quitte pendant la sélection : on choisit pour lui (pas de blocage). */
  forfeitSelection(playerId: string): void {
    if (this.state.phase !== 'selecting') return;
    const p = getPlayer(this.state, playerId);
    if (p && !p.characterChosen) {
      p.character = (p.characterOptions ?? [p.character])[0];
      p.characterChosen = true;
    }
    this.maybeFinishSelection();
  }

  broadcast(): void {
    for (const p of this.state.players) {
      if (!p.socketId) continue;
      const view = buildView(this.state, p.id);
      this.io.to(p.socketId).emit('game_state_update', view);
      const pa = view.pendingAction;
      if (pa) this.io.to(p.socketId).emit('action_required', pa);
    }
    this.scheduleBotTick();
  }

  // -------------------------------------------------------------------------
  // Pilotage des bots (dev)
  // -------------------------------------------------------------------------

  /** Planifie une action de bot si c'est à un bot d'agir. */
  private scheduleBotTick(): void {
    if (this.botTimer || this.state.phase !== 'playing') return;
    if (!this.currentBotActor()) return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      this.runBotAction();
    }, 700);
  }

  /** Bot dont c'est le tour d'agir (réaction prioritaire), ou null. */
  private currentBotActor(): ServerPlayer | null {
    const pa = this.state.pendingAction;
    if (pa) {
      const p = pa.awaiting[0] ? getPlayer(this.state, pa.awaiting[0]) : undefined;
      return p && p.isBot && p.isAlive ? p : null;
    }
    const active = activePlayer(this.state);
    if (active.isBot && active.isAlive && this.state.turnPhase === 'play') return active;
    return null;
  }

  private runBotAction(): void {
    const bot = this.currentBotActor();
    if (!bot) return;
    const pa = this.state.pendingAction;
    if (pa) this.botRespond(bot, pa);
    else this.botPlay(bot);
  }

  /** Stratégie minimale : tente 1 BANG! à portée, sinon finit le tour. */
  private botPlay(bot: ServerPlayer): void {
    // Pas de BANG! des bots pendant le 1er tour de table.
    const firstRound = this.state.turnCount <= this.state.players.length;
    const bang = firstRound ? undefined : bot.hand.find((c) => c.name === 'bang');
    if (bang && this.state.bangPlayedThisTurn === 0) {
      const targets = this.state.players.filter(
        (p) => p.isAlive && p.id !== bot.id && isInRange(this.state, bot.id, p.id),
      );
      if (targets.length) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        this.playCard(bot.id, bang.id, target.id);
        return;
      }
    }
    this.endTurnRequest(bot.id);
  }

  private botRespond(bot: ServerPlayer, pa: PendingAction): void {
    switch (pa.type) {
      case 'bang':
      case 'gatling': {
        const m = bot.hand.find((c) => canUseAsMissed(bot, c.name));
        if (m) this.respond(bot.id, 'missed', m.id);
        else this.respond(bot.id, 'take');
        break;
      }
      case 'indians': {
        const b = bot.hand.find((c) => canUseAsBang(bot, c.name));
        if (b) this.respond(bot.id, 'bang', b.id);
        else this.respond(bot.id, 'take');
        break;
      }
      case 'duel': {
        const b = bot.hand.find((c) => canUseAsBang(bot, c.name));
        if (b) this.respond(bot.id, 'bang', b.id);
        else this.respond(bot.id, 'fail');
        break;
      }
      case 'general_store':
        this.respond(bot.id, 'pick', pa.storeCards?.[0]?.id);
        break;
      case 'discard':
        this.respond(bot.id, 'discard', bot.hand[0]?.id);
        break;
    }
  }

  private socketOf(id: string): string | null {
    return getPlayer(this.state, id)?.socketId ?? null;
  }

  // -------------------------------------------------------------------------
  // Démarrage
  // -------------------------------------------------------------------------

  begin(): void {
    if (this.state.phase === 'selecting') {
      this.beginSelection();
    } else {
      this.beginPlay();
    }
  }

  // -------------------------------------------------------------------------
  // Phase de sélection des personnages
  // -------------------------------------------------------------------------

  private beginSelection(): void {
    this.state.selectionDeadline = Date.now() + SELECTION_TIMEOUT_MS;
    this.state.selectionTimer = setTimeout(() => this.resolveSelectionTimeout(), SELECTION_TIMEOUT_MS);
    // Les bots choisissent au hasard tout de suite.
    for (const p of this.state.players) {
      if (p.isBot && !p.characterChosen) {
        const opts = p.characterOptions ?? [p.character];
        p.character = opts[Math.floor(Math.random() * opts.length)];
        p.characterChosen = true;
      }
    }
    this.broadcast();
    this.maybeFinishSelection();
  }

  chooseCharacter(playerId: string, character: CharacterName): void {
    if (this.state.phase !== 'selecting') return;
    const p = getPlayer(this.state, playerId);
    if (!p || p.characterChosen) return;
    if (!p.characterOptions?.includes(character)) return this.err(playerId, 'Personnage invalide.');
    p.character = character;
    p.characterChosen = true;
    this.broadcast();
    this.maybeFinishSelection();
  }

  private resolveSelectionTimeout(): void {
    if (this.state.phase !== 'selecting') return;
    for (const p of this.state.players) {
      if (!p.characterChosen) {
        p.character = (p.characterOptions ?? [p.character])[0];
        p.characterChosen = true;
      }
    }
    this.maybeFinishSelection();
  }

  private maybeFinishSelection(): void {
    if (this.state.phase !== 'selecting') return;
    if (!this.state.players.every((p) => p.characterChosen)) return;
    if (this.state.selectionTimer) clearTimeout(this.state.selectionTimer);
    this.state.selectionTimer = undefined;
    finalizeSetup(this.state);
    this.beginPlay();
  }

  private beginPlay(): void {
    addLog(this.state, 'La partie commence !');
    const sheriff = this.state.players.find((p) => p.role === 'sheriff');
    if (sheriff) addLog(this.state, `${sheriff.pseudo} est le ${roleLabel('sheriff', this.state.theme)}.`);
    this.startTurn();
  }

  // -------------------------------------------------------------------------
  // Cycle d'un tour
  // -------------------------------------------------------------------------

  private startTurn(): void {
    const player = activePlayer(this.state);
    this.state.bangPlayedThisTurn = 0;

    if (!player.isAlive) {
      this.advanceTurn();
      return;
    }

    this.state.turnCount += 1;
    addLog(this.state, `— Tour de ${player.pseudo} —`);
    this.state.turnPhase = 'draw';

    // 1. Dynamite
    if (this.resolveDynamite(player)) {
      // Le joueur est mort de l'explosion → tour suivant.
      if (this.maybeGameOver()) return;
      this.advanceTurn();
      return;
    }
    if (this.maybeGameOver()) return;

    // 2. Prison
    const jailed = this.resolveJail(player);
    if (jailed) {
      this.advanceTurn();
      return;
    }

    // 3. Pioche (choix interactif pour Kit/Jesse/Pedro humains, sinon auto).
    this.beginDrawPhase(player);
  }

  /**
   * Démarre la phase de pioche. Pour Kit Carlson / Jesse Jones / Pedro Ramirez
   * (humains), pose un choix ; sinon pioche automatiquement et passe au jeu.
   */
  private beginDrawPhase(player: ServerPlayer): void {
    if (!player.isBot) {
      if (player.character === 'kit_carlson') {
        const peek = drawCards(this.state, 3);
        this.setPending({
          type: 'draw',
          drawKind: 'kit',
          fromPlayerId: player.id,
          awaiting: [player.id],
          storeCards: peek,
          deadline: Date.now() + RESPONSE_TIMEOUT_MS,
        });
        this.broadcast();
        return;
      }
      if (
        player.character === 'jesse_jones' &&
        this.state.players.some((p) => p.isAlive && p.id !== player.id && p.hand.length > 0)
      ) {
        this.setPending({
          type: 'draw',
          drawKind: 'jesse',
          fromPlayerId: player.id,
          awaiting: [player.id],
          deadline: Date.now() + RESPONSE_TIMEOUT_MS,
        });
        this.broadcast();
        return;
      }
      if (player.character === 'pedro_ramirez' && this.state.discardPile.length > 0) {
        this.setPending({
          type: 'draw',
          drawKind: 'pedro',
          fromPlayerId: player.id,
          awaiting: [player.id],
          deadline: Date.now() + RESPONSE_TIMEOUT_MS,
        });
        this.broadcast();
        return;
      }
    }
    // Pioche automatique (bots + personnages sans choix + cas non pertinents).
    this.autoDraw(player);
    this.state.turnPhase = 'play';
    this.broadcast();
  }

  /** Retourne true si le joueur est mort de la dynamite. */
  private resolveDynamite(player: ServerPlayer): boolean {
    const idx = player.inPlay.findIndex((c) => c.name === 'dynamite');
    if (idx < 0) return false;
    const dyn = player.inPlay[idx];

    // « tirer ! » : Pique entre 2 et 9 → explose.
    const res = drawCheck(this.state, player, (c) => c.suit === 'spades' && c.value >= 2 && c.value <= 9);
    if (res.success) {
      player.inPlay.splice(idx, 1);
      discard(this.state, dyn);
      addLog(this.state, `💥 La dynamite explose sur ${player.pseudo} (-3 PV) !`);
      const r = dealDamage(this.state, player, 3, null);
      return r.died;
    } else {
      // Passe au joueur vivant suivant.
      player.inPlay.splice(idx, 1);
      const next = this.nextAlive(this.state.currentPlayerIndex);
      if (next) {
        next.inPlay.push(dyn);
        addLog(this.state, `La dynamite passe à ${next.pseudo}.`);
      } else {
        discard(this.state, dyn);
      }
      return false;
    }
  }

  /** Retourne true si le tour est annulé (resté en prison). */
  private resolveJail(player: ServerPlayer): boolean {
    const idx = player.inPlay.findIndex((c) => c.name === 'jail');
    if (idx < 0) return false;
    const jail = player.inPlay[idx];
    player.inPlay.splice(idx, 1);
    discard(this.state, jail);

    const res = drawCheck(this.state, player, (c) => c.suit === 'hearts');
    if (res.success) {
      addLog(this.state, `${player.pseudo} sort de prison (Cœur) et joue normalement.`);
      return false;
    }
    addLog(this.state, `${player.pseudo} reste en prison : son tour est annulé.`);
    return true;
  }

  /** Pioche automatique (pour les bots et personnages sans choix). */
  private autoDraw(player: ServerPlayer): void {
    // Black Jack : la 2e carte est révélée ; si Cœur/Carreau, pioche 1 bonus.
    if (player.character === 'black_jack') {
      const c1 = drawCard(this.state);
      const c2 = drawCard(this.state);
      if (c1) player.hand.push(c1);
      if (c2) {
        player.hand.push(c2);
        addLog(this.state, `${player.pseudo} (Black Jack) révèle ${this.cardLabel(c2)}.`);
        if (c2.suit === 'hearts' || c2.suit === 'diamonds') {
          const bonus = drawCard(this.state);
          if (bonus) {
            player.hand.push(bonus);
            addLog(this.state, `${player.pseudo} pioche 1 carte bonus.`);
          }
        }
      }
      return;
    }

    // Kit Carlson : regarde 3, garde 2, remet 1 dessus (simplifié : garde les 2
    // premières, remet la 3e sur le deck).
    if (player.character === 'kit_carlson') {
      const top3 = drawCards(this.state, 3);
      const keep = top3.slice(0, 2);
      const back = top3.slice(2);
      player.hand.push(...keep);
      for (const c of back) this.state.deck.push(c); // remis sur le dessus
      addLog(this.state, `${player.pseudo} (Kit Carlson) garde 2 cartes et en remet 1.`);
      return;
    }

    // Pedro Ramirez : peut piocher la 1re carte sur la défausse.
    if (player.character === 'pedro_ramirez' && this.state.discardPile.length > 0) {
      const fromDiscard = this.state.discardPile.pop()!;
      const second = drawCard(this.state);
      player.hand.push(fromDiscard);
      if (second) player.hand.push(second);
      addLog(this.state, `${player.pseudo} (Pedro Ramirez) pioche 1 carte de la défausse.`);
      return;
    }

    // Défaut : pioche 2 cartes.
    player.hand.push(...drawCards(this.state, 2));
  }

  endTurnRequest(playerId: string): void {
    const player = activePlayer(this.state);
    if (player.id !== playerId || this.state.turnPhase !== 'play' || this.state.pendingAction) {
      return;
    }
    // Défausse si la main dépasse les PV.
    if (player.hand.length > player.hp) {
      this.state.turnPhase = 'discard';
      this.setPending({
        type: 'discard',
        fromPlayerId: player.id,
        awaiting: [player.id],
        deadline: Date.now() + RESPONSE_TIMEOUT_MS,
      });
      this.broadcast();
      return;
    }
    this.advanceTurn();
  }

  private advanceTurn(): void {
    this.clearPending();
    const next = this.nextAlive(this.state.currentPlayerIndex);
    if (!next) return;
    this.state.currentPlayerIndex = this.state.players.indexOf(next);
    this.startTurn();
  }

  private nextAlive(fromIndex: number): ServerPlayer | null {
    const n = this.state.players.length;
    for (let step = 1; step <= n; step++) {
      const p = this.state.players[(fromIndex + step) % n];
      if (p.isAlive) return p;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Jeu d'une carte (joueur actif)
  // -------------------------------------------------------------------------

  playCard(playerId: string, cardId: string, targetId?: string, secondCardId?: string): void {
    const player = activePlayer(this.state);
    if (player.id !== playerId) return this.err(playerId, 'Ce n\'est pas votre tour.');
    if (this.state.turnPhase !== 'play') return this.err(playerId, 'Vous ne pouvez pas jouer maintenant.');
    if (this.state.pendingAction) return this.err(playerId, 'Une action est en attente.');

    const cardIdx = player.hand.findIndex((c) => c.id === cardId);
    if (cardIdx < 0) return this.err(playerId, 'Carte introuvable.');
    const card = player.hand[cardIdx];

    const handled = this.applyCard(player, card, cardIdx, targetId, secondCardId);
    if (!handled) return;

    this.checkSuzy(player);
    if (this.maybeGameOver()) return;
    this.broadcast();
  }

  /** Applique l'effet d'une carte. Retourne false si rejetée (erreur déjà émise). */
  private applyCard(
    player: ServerPlayer,
    card: Card,
    cardIdx: number,
    targetId?: string,
    secondCardId?: string,
  ): boolean {
    const target = targetId ? getPlayer(this.state, targetId) : undefined;

    switch (card.name) {
      // ---- Armes & équipements bleus ----
      case 'volcanic':
      case 'schofield':
      case 'remington':
      case 'rev_carabine':
      case 'winchester':
        return this.equipWeapon(player, card, cardIdx);
      case 'barrel':
      case 'mustang':
      case 'scope':
        return this.equipUniqueBlue(player, card, cardIdx);
      case 'dynamite':
        return this.equipDynamite(player, card, cardIdx);
      case 'jail':
        return this.playJail(player, card, cardIdx, target);

      // ---- Brunes à effet immédiat ----
      case 'beer':
        return this.playBeer(player, card, cardIdx);
      case 'saloon':
        return this.playSaloon(player, card, cardIdx);
      case 'wells_fargo':
        return this.playDrawCards(player, card, cardIdx, 3);
      case 'stagecoach':
        return this.playDrawCards(player, card, cardIdx, 2);
      case 'panic':
        return this.playPanic(player, card, cardIdx, target, secondCardId);
      case 'cat_balou':
        return this.playCatBalou(player, card, cardIdx, target, secondCardId);

      // ---- Brunes réactives (créent un pendingAction) ----
      case 'bang':
        return this.playBang(player, card, cardIdx, target);
      case 'indians':
        return this.playIndians(player, card, cardIdx);
      case 'gatling':
        return this.playGatling(player, card, cardIdx);
      case 'duel':
        return this.playDuel(player, card, cardIdx, target);
      case 'general_store':
        return this.playGeneralStore(player, card, cardIdx);

      // ---- Missed! : réaction seulement, SAUF Calamity Janet qui peut le
      //      jouer comme un BANG! à l'attaque. ----
      case 'missed':
        if (player.character === 'calamity_janet' && target) {
          return this.playBang(player, card, cardIdx, target);
        }
        this.err(player.id, 'Raté ! ne se joue qu\'en réaction.');
        return false;
    }
  }

  // -------------------------------------------------------------------------
  // Équipements
  // -------------------------------------------------------------------------

  private equipWeapon(player: ServerPlayer, card: Card, idx: number): boolean {
    // Remplace l'arme existante.
    const existing = player.inPlay.findIndex((c) => c.isWeapon);
    player.hand.splice(idx, 1);
    if (existing >= 0) {
      const old = player.inPlay.splice(existing, 1)[0];
      discard(this.state, old);
    }
    player.inPlay.push(card);
    addLog(this.state, `${player.pseudo} équipe ${this.cardLabel(card)}.`);
    return true;
  }

  private equipUniqueBlue(player: ServerPlayer, card: Card, idx: number): boolean {
    if (hasEquipment(player, card.name)) {
      this.err(player.id, 'Vous avez déjà cet équipement.');
      return false;
    }
    player.hand.splice(idx, 1);
    player.inPlay.push(card);
    addLog(this.state, `${player.pseudo} pose ${this.cardLabel(card)}.`);
    return true;
  }

  private equipDynamite(player: ServerPlayer, card: Card, idx: number): boolean {
    if (hasEquipment(player, 'dynamite')) {
      this.err(player.id, 'Une dynamite est déjà posée devant vous.');
      return false;
    }
    player.hand.splice(idx, 1);
    player.inPlay.push(card);
    addLog(this.state, `${player.pseudo} pose la Dynamite.`);
    return true;
  }

  private playJail(player: ServerPlayer, card: Card, idx: number, target?: ServerPlayer): boolean {
    if (!target) return this.err(player.id, 'Choisissez une cible.'), false;
    if (target.role === 'sheriff') return this.err(player.id, 'On ne peut pas emprisonner le Shérif.'), false;
    if (!target.isAlive) return this.err(player.id, 'Cible invalide.'), false;
    if (hasEquipment(target, 'jail')) return this.err(player.id, 'Ce joueur est déjà en prison.'), false;
    player.hand.splice(idx, 1);
    target.inPlay.push(card);
    addLog(this.state, `${player.pseudo} met ${target.pseudo} en prison.`);
    return true;
  }

  // -------------------------------------------------------------------------
  // Brunes immédiates
  // -------------------------------------------------------------------------

  private playBeer(player: ServerPlayer, card: Card, idx: number): boolean {
    if (!canUseBeer(this.state)) {
      return this.err(player.id, 'La Bière est inutile à 2 joueurs.'), false;
    }
    if (player.hp >= player.maxHp) {
      return this.err(player.id, 'Vous êtes déjà au maximum de PV.'), false;
    }
    player.hand.splice(idx, 1);
    discard(this.state, card);
    heal(this.state, player, 1);
    return true;
  }

  private playSaloon(player: ServerPlayer, card: Card, idx: number): boolean {
    player.hand.splice(idx, 1);
    discard(this.state, card);
    addLog(this.state, `${player.pseudo} joue Saloon : tout le monde récupère 1 PV.`);
    for (const p of alivePlayers(this.state)) heal(this.state, p, 1);
    return true;
  }

  private playDrawCards(player: ServerPlayer, card: Card, idx: number, n: number): boolean {
    player.hand.splice(idx, 1);
    discard(this.state, card);
    player.hand.push(...drawCards(this.state, n));
    addLog(this.state, `${player.pseudo} joue ${this.cardLabel(card)} et pioche ${n} cartes.`);
    return true;
  }

  private playPanic(
    player: ServerPlayer,
    card: Card,
    idx: number,
    target?: ServerPlayer,
    secondCardId?: string,
  ): boolean {
    if (!target || !target.isAlive || target.id === player.id) {
      return this.err(player.id, 'Cible invalide.'), false;
    }
    if (distanceBetween(this.state, player.id, target.id) > 1) {
      return this.err(player.id, 'Panique ! ne touche qu\'à distance 1.'), false;
    }
    const stolen = this.takeCardFrom(target, secondCardId);
    if (!stolen) return this.err(player.id, 'Ce joueur n\'a aucune carte.'), false;
    player.hand.splice(idx, 1);
    discard(this.state, card);
    player.hand.push(stolen);
    addLog(this.state, `${player.pseudo} vole une carte à ${target.pseudo} (Panique !).`);
    this.checkSuzy(target);
    return true;
  }

  private playCatBalou(
    player: ServerPlayer,
    card: Card,
    idx: number,
    target?: ServerPlayer,
    secondCardId?: string,
  ): boolean {
    if (!target || !target.isAlive || target.id === player.id) {
      return this.err(player.id, 'Cible invalide.'), false;
    }
    const removed = this.takeCardFrom(target, secondCardId);
    if (!removed) return this.err(player.id, 'Ce joueur n\'a aucune carte.'), false;
    player.hand.splice(idx, 1);
    discard(this.state, card);
    discard(this.state, removed);
    addLog(this.state, `${player.pseudo} force ${target.pseudo} à défausser une carte (Cat Balou).`);
    this.checkSuzy(target);
    return true;
  }

  /**
   * Retire une carte de `target` : la carte en jeu désignée par `cardId`, sinon
   * une carte aléatoire de la main.
   */
  private takeCardFrom(target: ServerPlayer, cardId?: string): Card | null {
    if (cardId) {
      const ip = target.inPlay.findIndex((c) => c.id === cardId);
      if (ip >= 0) return target.inPlay.splice(ip, 1)[0];
      const h = target.hand.findIndex((c) => c.id === cardId);
      if (h >= 0) return target.hand.splice(h, 1)[0];
    }
    if (target.hand.length > 0) {
      const r = Math.floor(Math.random() * target.hand.length);
      return target.hand.splice(r, 1)[0];
    }
    if (target.inPlay.length > 0) {
      return target.inPlay.splice(0, 1)[0];
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Brunes réactives
  // -------------------------------------------------------------------------

  private playBang(player: ServerPlayer, card: Card, idx: number, target?: ServerPlayer): boolean {
    if (!target || !target.isAlive || target.id === player.id) {
      return this.err(player.id, 'Cible invalide.'), false;
    }
    const unlimited = player.character === 'willy_the_kid' || hasEquipment(player, 'volcanic');
    if (!unlimited && this.state.bangPlayedThisTurn >= 1) {
      return this.err(player.id, 'Un seul BANG! par tour.'), false;
    }
    if (!isInRange(this.state, player.id, target.id)) {
      return this.err(player.id, 'Cible hors de portée.'), false;
    }
    player.hand.splice(idx, 1);
    discard(this.state, card);
    this.state.bangPlayedThisTurn += 1;
    addLog(this.state, `${player.pseudo} tire sur ${target.pseudo} (BANG!).`);
    this.resolveBangOn(target, player.id);
    return true;
  }

  /** Lance la résolution d'un BANG! sur une cible (Tonneau auto, puis Raté!). */
  private resolveBangOn(target: ServerPlayer, attackerId: string): void {
    const attacker = getPlayer(this.state, attackerId);
    let missedRequired = attacker?.character === 'slab_the_killer' ? 2 : 1;

    // Tonneau (et Jourdonnais) : jets « tirer ! », chaque Cœur = 1 Raté!.
    let barrels = (hasEquipment(target, 'barrel') ? 1 : 0) + (target.character === 'jourdonnais' ? 1 : 0);
    while (barrels > 0 && missedRequired > 0) {
      const res = drawCheck(this.state, target, (c) => c.suit === 'hearts');
      if (res.success) {
        missedRequired -= 1;
        addLog(this.state, `${target.pseudo} esquive grâce à ${cardLabelOf('barrel', this.state.theme)} (Cœur).`);
      }
      barrels -= 1;
    }

    if (missedRequired <= 0) {
      addLog(this.state, `${target.pseudo} esquive le BANG!.`);
      return;
    }

    this.setPending({
      type: 'bang',
      fromPlayerId: attackerId,
      awaiting: [target.id],
      missedRequired,
      missedProvided: 0,
      deadline: Date.now() + RESPONSE_TIMEOUT_MS,
    });
  }

  private playIndians(player: ServerPlayer, card: Card, idx: number): boolean {
    player.hand.splice(idx, 1);
    discard(this.state, card);
    addLog(this.state, `${player.pseudo} joue ${this.cardLabel(card)} : tous doivent montrer un ${cardLabelOf('bang', this.state.theme)}.`);
    const targets = this.orderFrom(player.id).filter((p) => p.id !== player.id);
    this.setPending({
      type: 'indians',
      fromPlayerId: player.id,
      awaiting: targets.map((p) => p.id),
      deadline: Date.now() + RESPONSE_TIMEOUT_MS,
    });
    return true;
  }

  private playGatling(player: ServerPlayer, card: Card, idx: number): boolean {
    player.hand.splice(idx, 1);
    discard(this.state, card);
    addLog(this.state, `${player.pseudo} déclenche ${this.cardLabel(card)} sur tous les autres.`);
    const targets = this.orderFrom(player.id).filter((p) => p.id !== player.id);
    this.setPending({
      type: 'gatling',
      fromPlayerId: player.id,
      awaiting: targets.map((p) => p.id),
      deadline: Date.now() + RESPONSE_TIMEOUT_MS,
    });
    this.processGatlingFront();
    return true;
  }

  /** Avance la file Gatling : applique les Tonneaux auto, attend un Raté! sinon. */
  private processGatlingFront(): void {
    const pa = this.state.pendingAction;
    if (!pa || pa.type !== 'gatling') return;
    while (pa.awaiting.length > 0) {
      const t = getPlayer(this.state, pa.awaiting[0]);
      if (!t || !t.isAlive) {
        pa.awaiting.shift();
        continue;
      }
      // Tonneau / Jourdonnais : jets « tirer ! », un Cœur esquive.
      let barrels = (hasEquipment(t, 'barrel') ? 1 : 0) + (t.character === 'jourdonnais' ? 1 : 0);
      let dodged = false;
      while (barrels > 0) {
        const res = drawCheck(this.state, t, (c) => c.suit === 'hearts');
        if (res.success) {
          dodged = true;
          break;
        }
        barrels -= 1;
      }
      if (dodged) {
        addLog(this.state, `${t.pseudo} esquive la ${cardLabelOf('gatling', this.state.theme)} (${cardLabelOf('barrel', this.state.theme)}).`);
        pa.awaiting.shift();
        continue;
      }
      pa.deadline = Date.now() + RESPONSE_TIMEOUT_MS;
      this.refreshTimer(pa);
      return;
    }
    this.clearPending();
  }

  private playDuel(player: ServerPlayer, card: Card, idx: number, target?: ServerPlayer): boolean {
    if (!target || !target.isAlive || target.id === player.id) {
      return this.err(player.id, 'Cible invalide.'), false;
    }
    player.hand.splice(idx, 1);
    discard(this.state, card);
    addLog(this.state, `${player.pseudo} défie ${target.pseudo} en duel.`);
    // La cible doit jouer un BANG! en premier.
    this.setPending({
      type: 'duel',
      fromPlayerId: player.id,
      awaiting: [target.id],
      duelTarget: target.id,
      duelOther: player.id,
      deadline: Date.now() + RESPONSE_TIMEOUT_MS,
    });
    return true;
  }

  private playGeneralStore(player: ServerPlayer, card: Card, idx: number): boolean {
    player.hand.splice(idx, 1);
    discard(this.state, card);
    const n = alivePlayers(this.state).length;
    const cards = drawCards(this.state, n);
    addLog(this.state, `${player.pseudo} joue Général Store (${n} cartes étalées).`);
    this.setPending({
      type: 'general_store',
      fromPlayerId: player.id,
      awaiting: this.orderFrom(player.id).map((p) => p.id),
      storeCards: cards,
      deadline: Date.now() + RESPONSE_TIMEOUT_MS,
    });
    return true;
  }

  // -------------------------------------------------------------------------
  // Réponses aux pendingAction
  // -------------------------------------------------------------------------

  respond(
    playerId: string,
    response: string,
    cardId?: string,
    cardIds?: string[],
    targetPlayerId?: string,
  ): void {
    const pa = this.state.pendingAction;
    if (!pa) return;
    if (pa.awaiting[0] !== playerId) return this.err(playerId, 'Ce n\'est pas à vous de répondre.');

    switch (pa.type) {
      case 'bang':
        this.respondBang(pa, playerId, response, cardId);
        break;
      case 'gatling':
        this.respondGatling(pa, playerId, response, cardId);
        break;
      case 'indians':
        this.respondIndians(pa, playerId, response, cardId);
        break;
      case 'duel':
        this.respondDuel(pa, playerId, response, cardId);
        break;
      case 'general_store':
        this.respondStore(pa, playerId, cardId);
        break;
      case 'draw':
        this.respondDraw(pa, playerId, response, cardIds, targetPlayerId);
        break;
      case 'discard':
        this.respondDiscard(pa, playerId, cardId);
        break;
    }

    if (this.maybeGameOver()) return;
    this.broadcast();
  }

  private respondBang(pa: PendingAction, playerId: string, response: string, cardId?: string): void {
    const target = getPlayer(this.state, playerId)!;
    if (response === 'missed' && cardId) {
      const ci = target.hand.findIndex((c) => c.id === cardId);
      if (ci < 0) return this.err(playerId, 'Carte introuvable.');
      const c = target.hand[ci];
      if (!canUseAsMissed(target, c.name)) return this.err(playerId, 'Cette carte ne peut pas servir de Raté!.');
      target.hand.splice(ci, 1);
      discard(this.state, c);
      this.checkSuzy(target);
      pa.missedProvided = (pa.missedProvided ?? 0) + 1;
      if (pa.missedProvided >= (pa.missedRequired ?? 1)) {
        addLog(this.state, `${target.pseudo} esquive le BANG! (Raté!).`);
        this.clearPending();
      } else {
        pa.deadline = Date.now() + RESPONSE_TIMEOUT_MS;
        this.refreshTimer(pa);
      }
    } else {
      // Encaisse.
      dealDamage(this.state, target, 1, pa.fromPlayerId);
      this.clearPending();
    }
  }

  private respondIndians(pa: PendingAction, playerId: string, response: string, cardId?: string): void {
    const p = getPlayer(this.state, playerId)!;
    if (response === 'bang' && cardId) {
      const ci = p.hand.findIndex((c) => c.id === cardId);
      if (ci < 0) return this.err(playerId, 'Carte introuvable.');
      const c = p.hand[ci];
      if (!canUseAsBang(p, c.name)) return this.err(playerId, 'Il faut un BANG!.');
      p.hand.splice(ci, 1);
      discard(this.state, c);
      this.checkSuzy(p);
      addLog(this.state, `${p.pseudo} montre un BANG! et évite les Indiens.`);
    } else {
      dealDamage(this.state, p, 1, pa.fromPlayerId);
    }
    pa.awaiting.shift();
    this.advancePendingQueue(pa);
  }

  private respondGatling(pa: PendingAction, playerId: string, response: string, cardId?: string): void {
    const p = getPlayer(this.state, playerId)!;
    if (response === 'missed' && cardId) {
      const ci = p.hand.findIndex((c) => c.id === cardId);
      if (ci < 0) return this.err(playerId, 'Carte introuvable.');
      const c = p.hand[ci];
      if (!canUseAsMissed(p, c.name)) return this.err(playerId, 'Il faut un Raté!.');
      p.hand.splice(ci, 1);
      discard(this.state, c);
      this.checkSuzy(p);
      addLog(this.state, `${p.pseudo} esquive la ${cardLabelOf('gatling', this.state.theme)}.`);
    } else {
      dealDamage(this.state, p, 1, pa.fromPlayerId);
    }
    pa.awaiting.shift();
    this.processGatlingFront(); // applique les Tonneaux du joueur suivant
  }

  private respondDuel(pa: PendingAction, playerId: string, response: string, cardId?: string): void {
    const p = getPlayer(this.state, playerId)!;
    if (response === 'bang' && cardId) {
      const ci = p.hand.findIndex((c) => c.id === cardId);
      if (ci < 0) return this.err(playerId, 'Carte introuvable.');
      const c = p.hand[ci];
      if (!canUseAsBang(p, c.name)) return this.err(playerId, 'Il faut un BANG!.');
      p.hand.splice(ci, 1);
      discard(this.state, c);
      this.checkSuzy(p);
      // L'autre joueur doit répondre à son tour.
      const other = playerId === pa.duelTarget ? pa.duelOther! : pa.duelTarget!;
      pa.awaiting = [other];
      pa.deadline = Date.now() + RESPONSE_TIMEOUT_MS;
      this.refreshTimer(pa);
      addLog(this.state, `${p.pseudo} riposte (BANG!) dans le duel.`);
    } else {
      // Ne peut pas jouer de BANG! → perd 1 PV.
      const opponentId = playerId === pa.duelTarget ? pa.duelOther! : pa.duelTarget!;
      dealDamage(this.state, p, 1, opponentId);
      addLog(this.state, `${p.pseudo} ne riposte pas et perd 1 PV (duel).`);
      this.clearPending();
    }
  }

  private respondStore(pa: PendingAction, playerId: string, cardId?: string): void {
    const p = getPlayer(this.state, playerId)!;
    const store = pa.storeCards ?? [];
    let pick = store.findIndex((c) => c.id === cardId);
    if (pick < 0) pick = 0; // défaut : première carte
    const chosen = store.splice(pick, 1)[0];
    if (chosen) {
      p.hand.push(chosen);
      addLog(this.state, `${p.pseudo} prend ${this.cardLabel(chosen)} (Général Store).`);
    }
    pa.awaiting.shift();
    if (pa.awaiting.length === 0 || store.length === 0) {
      // Distribue le reste si épuisement de joueurs (rare) puis termine.
      this.clearPending();
    } else {
      pa.deadline = Date.now() + RESPONSE_TIMEOUT_MS;
      this.refreshTimer(pa);
    }
  }

  /** Résout le choix de pioche de Kit Carlson / Jesse Jones / Pedro Ramirez. */
  private respondDraw(
    pa: PendingAction,
    playerId: string,
    response: string,
    cardIds?: string[],
    targetPlayerId?: string,
  ): void {
    const p = getPlayer(this.state, playerId)!;

    if (pa.drawKind === 'kit') {
      const peek = pa.storeCards ?? [];
      // Cartes gardées : celles désignées, sinon les 2 premières par défaut.
      let keep = peek.filter((c) => (cardIds ?? []).includes(c.id));
      if (keep.length !== 2) keep = peek.slice(0, 2);
      const back = peek.filter((c) => !keep.includes(c));
      p.hand.push(...keep);
      for (const c of back) this.state.deck.push(c); // remise sur le dessus
      addLog(this.state, `${p.pseudo} (Kit Carlson) garde 2 cartes et en remet 1.`);
    } else if (pa.drawKind === 'jesse') {
      // 1re carte : main d'un joueur visé, sinon pioche.
      const target = targetPlayerId ? getPlayer(this.state, targetPlayerId) : undefined;
      if (response === 'steal' && target && target.id !== p.id && target.hand.length > 0) {
        const i = Math.floor(Math.random() * target.hand.length);
        const stolen = target.hand.splice(i, 1)[0];
        p.hand.push(stolen);
        this.checkSuzy(target);
        addLog(this.state, `${p.pseudo} (Jesse Jones) vole une carte à ${target.pseudo}.`);
      } else {
        const c = drawCard(this.state);
        if (c) p.hand.push(c);
      }
      const second = drawCard(this.state);
      if (second) p.hand.push(second);
    } else if (pa.drawKind === 'pedro') {
      // 1re carte : défausse ou pioche.
      if (response === 'discard' && this.state.discardPile.length > 0) {
        const fromDiscard = this.state.discardPile.pop()!;
        p.hand.push(fromDiscard);
        addLog(this.state, `${p.pseudo} (Pedro Ramirez) pioche la carte du dessus de la défausse.`);
      } else {
        const c = drawCard(this.state);
        if (c) p.hand.push(c);
      }
      const second = drawCard(this.state);
      if (second) p.hand.push(second);
    }

    this.clearPending();
    this.state.turnPhase = 'play';
    this.broadcast();
  }

  private respondDiscard(pa: PendingAction, playerId: string, cardId?: string): void {
    const p = getPlayer(this.state, playerId)!;
    let ci = p.hand.findIndex((c) => c.id === cardId);
    if (ci < 0) ci = 0;
    const c = p.hand.splice(ci, 1)[0];
    if (c) discard(this.state, c);
    if (p.hand.length <= p.hp) {
      this.advanceTurn();
    } else {
      pa.deadline = Date.now() + RESPONSE_TIMEOUT_MS;
      this.refreshTimer(pa);
    }
  }

  /** Avance la file d'une action multi-joueurs (Indiens, Store). */
  private advancePendingQueue(pa: PendingAction): void {
    if (pa.awaiting.length === 0) {
      this.clearPending();
    } else {
      pa.deadline = Date.now() + RESPONSE_TIMEOUT_MS;
      this.refreshTimer(pa);
    }
  }

  // -------------------------------------------------------------------------
  // Pouvoirs activables
  // -------------------------------------------------------------------------

  usePower(playerId: string, power: string, cardIds?: string[]): void {
    const p = getPlayer(this.state, playerId);
    if (!p || !p.isAlive) return;

    // Sid Ketchum : défausse 2 cartes pour regagner 1 PV.
    if (power === 'sid_heal' && p.character === 'sid_ketchum') {
      if (p.hp >= p.maxHp) return this.err(playerId, 'PV déjà au maximum.');
      const ids = cardIds ?? [];
      if (ids.length !== 2) return this.err(playerId, 'Choisissez 2 cartes à défausser.');
      const cards: Card[] = [];
      for (const id of ids) {
        const i = p.hand.findIndex((c) => c.id === id);
        if (i < 0) return this.err(playerId, 'Carte introuvable.');
        cards.push(p.hand.splice(i, 1)[0]);
      }
      for (const c of cards) discard(this.state, c);
      heal(this.state, p, 1);
      addLog(this.state, `${p.pseudo} (Sid Ketchum) défausse 2 cartes pour +1 PV.`);
      this.checkSuzy(p);
      this.broadcast();
      return;
    }

    this.err(playerId, 'Pouvoir indisponible.');
  }

  // -------------------------------------------------------------------------
  // Timers & pendingAction
  // -------------------------------------------------------------------------

  private setPending(pa: PendingAction): void {
    this.clearPending();
    this.state.pendingAction = pa;
    this.refreshTimer(pa);
  }

  private refreshTimer(pa: PendingAction): void {
    if (pa.timer) clearTimeout(pa.timer);
    pa.timer = setTimeout(() => this.onTimeout(), RESPONSE_TIMEOUT_MS);
  }

  private clearPending(): void {
    if (this.state.pendingAction?.timer) clearTimeout(this.state.pendingAction.timer);
    this.state.pendingAction = null;
  }

  /** Résolution automatique à l'expiration : réponse « ne rien jouer ». */
  private onTimeout(): void {
    const pa = this.state.pendingAction;
    if (!pa) return;
    const current = pa.awaiting[0];
    if (!current) {
      this.clearPending();
      this.broadcast();
      return;
    }
    addLog(this.state, 'Temps écoulé : réponse automatique.');
    switch (pa.type) {
      case 'bang':
        this.respond(current, 'take');
        break;
      case 'gatling':
        this.respond(current, 'take');
        break;
      case 'indians':
        this.respond(current, 'take');
        break;
      case 'duel':
        this.respond(current, 'fail');
        break;
      case 'general_store':
        this.respond(current, 'pick');
        break;
      case 'draw':
        this.respond(current, 'deck'); // défaut : pioche normale (Kit garde 2)
        break;
      case 'discard':
        this.respond(current, 'discard');
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Divers
  // -------------------------------------------------------------------------

  /** Suzy Lafayette : pioche 1 si elle n'a plus de carte. */
  private checkSuzy(p: ServerPlayer): void {
    if (p.character === 'suzy_lafayette' && p.isAlive && p.hand.length === 0) {
      const c = drawCard(this.state);
      if (c) {
        p.hand.push(c);
        addLog(this.state, `${p.pseudo} (Suzy Lafayette) pioche 1 carte.`);
      }
    }
  }

  /** Liste des joueurs vivants en partant du joueur `id` (inclus), sens horaire. */
  private orderFrom(id: string): ServerPlayer[] {
    const idx = this.state.players.findIndex((p) => p.id === id);
    const out: ServerPlayer[] = [];
    const n = this.state.players.length;
    for (let step = 0; step < n; step++) {
      const p = this.state.players[(idx + step) % n];
      if (p.isAlive) out.push(p);
    }
    return out;
  }

  /** Élimine un joueur dont le délai de reconnexion a expiré. */
  eliminateDisconnected(playerId: string): void {
    const p = getPlayer(this.state, playerId);
    if (!p || !p.isAlive || this.state.phase !== 'playing') return;
    addLog(this.state, `${p.pseudo} ne s'est pas reconnecté à temps et est éliminé.`);
    const wasActive = activePlayer(this.state).id === playerId;

    eliminate(this.state, p, null);

    // Retire le joueur de toute file d'attente réactive en cours.
    const pa = this.state.pendingAction;
    if (pa) {
      const wasAwaiting = pa.awaiting[0] === playerId;
      pa.awaiting = pa.awaiting.filter((id) => id !== playerId);
      if (pa.awaiting.length === 0) {
        this.clearPending();
      } else if (wasAwaiting) {
        pa.deadline = Date.now() + RESPONSE_TIMEOUT_MS;
        this.refreshTimer(pa);
      }
    }

    if (this.maybeGameOver()) return;

    if (wasActive && !this.state.pendingAction) {
      this.advanceTurn();
      return;
    }
    this.broadcast();
  }

  private maybeGameOver(): boolean {
    const result = checkWinConditions(this.state);
    if (!result) return false;
    this.clearPending();
    this.state.phase = 'ended';
    this.state.winners = result;

    const reveal = this.state.players.map((p) => ({
      playerId: p.id,
      pseudo: p.pseudo,
      role: p.role,
      character: p.character,
    }));
    const winners = this.state.players
      .filter((p) => result.playerIds.includes(p.id))
      .map((p) => ({ playerId: p.id, pseudo: p.pseudo, role: p.role }));

    const payload: GameOverView = {
      theme: this.state.theme,
      winners,
      winCondition: result.condition,
      reveal,
    };
    addLog(this.state, `🏆 ${result.condition}`);
    this.broadcast();
    this.io.to(this.state.roomCode).emit('game_over', payload);
    this.onGameOver?.(this.state.roomCode);
    return true;
  }

  private err(playerId: string, message: string): void {
    const sid = this.socketOf(playerId);
    if (sid) this.io.to(sid).emit('error', { message });
  }

  private cardLabel(card: Card): string {
    return cardLabelOf(card.name, this.state.theme);
  }
}
