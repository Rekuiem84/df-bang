import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameApi } from '../hooks/useGame';
import type { Card, PublicPlayer } from '@shared/types';
import type { CharacterName, Role, Theme } from '@shared/types';
import { CardView } from '../components/CardView';
import { TableSeat } from '../components/TableSeat';
import { DiscardPile } from '../components/DiscardPile';
import { ReactionModal } from '../components/ReactionModal';
import { DrawChoiceModal } from '../components/DrawChoiceModal';
import { CharacterModal } from '../components/CharacterModal';
import { cardLabel, roleLabel, CHARACTER_LABELS } from '@shared/data';

/** Cartes nécessitant la sélection d'une cible. */
const NEEDS_TARGET = new Set(['bang', 'panic', 'cat_balou', 'duel', 'jail']);
/** Distance verticale (px) à franchir vers le haut pour poser une carte. */
const DRAG_THRESHOLD = 70;

interface DragState {
  id: string;
  dx: number;
  dy: number;
  armed: boolean;
}

export function Game({ api }: { api: GameApi }) {
  const game = api.game;
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const [pickFor, setPickFor] = useState<{ card: Card; target: PublicPlayer } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [infoChar, setInfoChar] = useState<CharacterName | null>(null);
  const [preview, setPreview] = useState<Card | null>(null);
  const [guesses, setGuesses] = useState<Record<string, Role | undefined>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [turnBanner, setTurnBanner] = useState<string | null>(null);
  const prevTurnRef = useRef<string | null>(null);
  const gestureRef = useRef<{ card: Card; x: number; y: number; moved: boolean } | null>(null);

  // Bannière « c'est au tour de … » à chaque changement de joueur actif.
  useEffect(() => {
    const g = api.game;
    if (!g || g.phase !== 'playing' || !g.currentPlayerId) return;
    if (g.currentPlayerId === prevTurnRef.current) return;
    prevTurnRef.current = g.currentPlayerId;
    const isMe = g.me?.id === g.currentPlayerId;
    const name = g.players.find((p) => p.id === g.currentPlayerId)?.pseudo ?? '…';
    setTurnBanner(isMe ? '🤠 À toi de jouer !' : `Au tour de ${name}`);
    const t = setTimeout(() => setTurnBanner(null), 2600);
    return () => clearTimeout(t);
  }, [api.game?.currentPlayerId, api.game?.phase]);

  // Cycle de marquage : aucun → Hors-la-loi → Renégat → Adjoint → aucun.
  const GUESS_CYCLE: (Role | undefined)[] = [undefined, 'outlaw', 'renegade', 'deputy'];
  function cycleGuess(pid: string) {
    setGuesses((g) => {
      const cur = g[pid];
      const idx = GUESS_CYCLE.indexOf(cur);
      const next = GUESS_CYCLE[(idx + 1) % GUESS_CYCLE.length];
      return { ...g, [pid]: next };
    });
  }

  const me = game?.me;
  const isMyTurn = game?.currentPlayerId === me?.id;
  const myWeaponRange = useMemo(() => {
    const w = me?.inPlay.find((c) => c.isWeapon);
    return w?.weaponRange ?? 1;
  }, [me]);

  if (!game || !me) return <div className="screen">Chargement…</div>;

  const theme = game.theme;
  const pending = game.pendingAction;
  const awaitingMe = pending && pending.awaitingPlayerId === me.id;
  const canPlay = isMyTurn && game.turnPhase === 'play' && !pending;

  function isValidTarget(card: Card, p: PublicPlayer): boolean {
    if (!p.isAlive || p.id === me!.id) return false;
    const dist = game!.distances[p.id] ?? Infinity;
    switch (card.name) {
      case 'bang':
        return dist <= myWeaponRange;
      case 'panic':
        return dist <= 1;
      case 'duel':
      case 'cat_balou':
        return true;
      case 'jail':
        return p.role !== 'sheriff' && !p.inPlay.some((c) => c.name === 'jail');
      default:
        return false;
    }
  }

  /** Déclenche le jeu d'une carte (après glisser réussi ou clic cible). */
  function playOrTarget(card: Card) {
    if (NEEDS_TARGET.has(card.name)) {
      setPendingCard(card);
    } else {
      api.playCard(card.id);
    }
  }

  function onSeatClick(p: PublicPlayer) {
    if (!pendingCard || !isValidTarget(pendingCard, p)) return;
    if (pendingCard.name === 'panic' || pendingCard.name === 'cat_balou') {
      if (p.inPlay.length > 0 || p.handCount > 0) {
        setPickFor({ card: pendingCard, target: p });
        setPendingCard(null);
        return;
      }
    }
    api.playCard(pendingCard.id, p.id);
    setPendingCard(null);
  }

  function confirmPick(secondCardId?: string) {
    if (!pickFor) return;
    api.playCard(pickFor.card.id, pickFor.target.id, secondCardId);
    setPickFor(null);
  }

  // ---- Geste sur une carte : clic = aperçu, glisser vers le haut = jouer ----
  function clearGesture() {
    gestureRef.current = null;
  }
  function onPointerDown(e: React.PointerEvent, card: Card) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    gestureRef.current = { card, x: e.clientX, y: e.clientY, moved: false };
    setDrag(null);
  }
  function onPointerMove(e: React.PointerEvent) {
    const g = gestureRef.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) > 8) {
      g.moved = true; // c'est un glisser, pas un clic
    }
    if (g.moved && canPlay) {
      setDrag({ id: g.card.id, dx, dy, armed: dy < -DRAG_THRESHOLD });
    }
  }
  function onPointerUp(card: Card) {
    const g = gestureRef.current;
    const moved = g?.moved;
    const armed = drag?.armed;
    clearGesture();
    setDrag(null);
    if (moved) {
      if (armed && canPlay) playOrTarget(card);
    } else {
      // Clic simple sans déplacement → aperçu agrandi.
      setPreview(card);
    }
  }

  const targeting = !!pendingCard;
  const n = me.hand.length;

  return (
    <div className="screen game">
      {/* En-tête */}
      <div className="game-header">
        <span className="room-tag">🂠 {game.deckCount} · #{game.roomCode}</span>
        <span className="turn-info">
          {isMyTurn ? '➡️ À toi de jouer' : `Tour de ${currentName(game)}`}
          {game.turnPhase && <em> · {phaseLabel(game.turnPhase)}</em>}
        </span>
        <button className="btn ghost tiny" onClick={api.leave}>
          ⏏
        </button>
      </div>

      {/* Bouton historique de la partie */}
      <div className="subbar">
        <button className="btn tiny ghost" onClick={() => setShowLog(true)}>
          📖 Historique
        </button>
      </div>

      {/* Table : autres joueurs en arc + pile centrale */}
      <div className="table">
        {game.players.map((p, i) => (
          <div key={p.id} className="seat-slot" style={seatPosition(i, game.players.length)}>
            <TableSeat
              player={p}
              isCurrent={game.currentPlayerId === p.id}
              theme={theme}
              distance={game.distances[p.id]}
              selectable={targeting && isValidTarget(pendingCard!, p)}
              onSelect={() => onSeatClick(p)}
              onInfo={() => setInfoChar(p.character)}
              guess={guesses[p.id]}
              onCycleGuess={() => cycleGuess(p.id)}
            />
          </div>
        ))}
        <DiscardPile cards={game.discardRecent} armed={!!drag?.armed} onPreview={setPreview} theme={theme} />
        {game.discardAll.length > 0 && (
          <button
            className="discard-history-btn"
            title="Voir toute la défausse"
            onClick={() => setShowHistory(true)}
          >
            📜 {game.discardAll.length}
          </button>
        )}
      </div>

      {/* Bannière de tour */}
      {turnBanner && <div className="turn-banner">{turnBanner}</div>}

      {/* Zone du joueur */}
      <div className={`me-zone ${isMyTurn ? 'active' : ''}`}>
        <div className="me-status">
          <strong>{me.pseudo}</strong>
          <span className={`role role-${me.role}`}>{roleLabel(me.role, theme)}</span>
          <span className="me-char info" onClick={() => setInfoChar(me.character)}>
            {CHARACTER_LABELS[me.character]} ⓘ
          </span>
          <span className="me-hp">
            {'❤'.repeat(Math.max(0, me.hp))}
            <i>
              {me.hp}/{me.maxHp}
            </i>
          </span>
        </div>

        {/* Mes équipements */}
        <div className="equip-row">
          {me.inPlay.length === 0 ? (
            <span className="equip-empty">Aucun équipement</span>
          ) : (
            me.inPlay.map((c) => (
              <CardView key={c.id} card={c} small theme={theme} onClick={() => setPreview(c)} />
            ))
          )}
        </div>

        {targeting && (
          <div className="targeting-banner">
            Choisis une cible pour {cardLabel(pendingCard!.name, theme)}
            <button className="btn ghost tiny" onClick={() => setPendingCard(null)}>
              Annuler
            </button>
          </div>
        )}

        {/* Main en éventail */}
        <div className="fan">
          {me.hand.map((c, i) => {
            const isDragged = drag?.id === c.id;
            const base = fanTransform(i, n);
            const style: React.CSSProperties = isDragged
              ? {
                  // On garde l'ancrage du slot (left + translateX(-50%)) et on
                  // ajoute le déplacement du doigt par-dessus.
                  left: base.left,
                  transform: `translateX(-50%) translate(${drag!.dx}px, ${drag!.dy}px) rotate(0deg) scale(1.08)`,
                  transition: 'none',
                  zIndex: 100,
                }
              : { transform: base.transform, left: base.left, zIndex: i };
            return (
              <div
                key={c.id}
                className={`fan-card ${canPlay ? 'playable' : ''} ${isDragged && drag!.armed ? 'armed' : ''}`}
                style={style}
                onPointerDown={(e) => onPointerDown(e, c)}
                onPointerMove={onPointerMove}
                onPointerUp={() => onPointerUp(c)}
                onPointerCancel={() => {
                  clearGesture();
                  setDrag(null);
                }}
              >
                <CardView card={c} theme={theme} />
              </div>
            );
          })}
          {n === 0 && <div className="empty-hand">Aucune carte en main</div>}
        </div>

        <div className="turn-controls">
          {me.character === 'sid_ketchum' && me.hp < me.maxHp && me.hand.length >= 2 && (
            <SidKetchum api={api} hand={me.hand} theme={theme} />
          )}
          {canPlay && (
            <button className="btn primary" onClick={api.endTurn}>
              Finir le tour
            </button>
          )}
        </div>
      </div>

      {/* Aperçu agrandi (clic) — touche pour fermer */}
      {preview && (
        <div className="card-preview-overlay" onClick={() => setPreview(null)}>
          <div className="card-preview">
            <CardView card={preview} theme={theme} />
          </div>
        </div>
      )}

      {/* Historique de la défausse */}
      {showHistory && (
        <div className="modal-backdrop" onClick={() => setShowHistory(false)}>
          <div className="modal history-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Défausse ({game.discardAll.length})</h3>
            <p className="muted">De la plus ancienne à la plus récente.</p>
            <div className="history-grid">
              {game.discardAll.map((c, i) => (
                <div key={`${c.id}_${i}`} className="history-item">
                  <span className="history-num">{i + 1}</span>
                  <CardView card={c} small theme={theme} onClick={() => setPreview(c)} />
                </div>
              ))}
            </div>
            <button className="btn primary" onClick={() => setShowHistory(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Historique de la partie (journal) */}
      {showLog && (
        <div className="modal-backdrop" onClick={() => setShowLog(false)}>
          <div className="modal log-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Historique de la partie</h3>
            <div className="log-list">
              {game.log.length === 0 ? (
                <p className="muted">Rien pour l'instant.</p>
              ) : (
                game.log.map((line, i) => (
                  <div key={i} className="log-line">
                    {line}
                  </div>
                ))
              )}
            </div>
            <button className="btn primary" onClick={() => setShowLog(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Fiche personnage */}
      {infoChar && <CharacterModal character={infoChar} theme={theme} onClose={() => setInfoChar(null)} />}

      {/* Pop-up choix de pioche (Kit / Jesse / Pedro) */}
      {awaitingMe && pending?.type === 'draw' && (
        <DrawChoiceModal api={api} pending={pending} game={game} theme={theme} />
      )}

      {/* Pop-up réaction */}
      {awaitingMe && pending && pending.type !== 'draw' && (
        <ReactionModal api={api} pending={pending} me={me} theme={theme} />
      )}

      {/* Pop-up choix de carte (Panique / Cat Balou) */}
      {pickFor && (
        <div className="modal-backdrop" onClick={() => setPickFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {cardLabel(pickFor.card.name, theme)} → {pickFor.target.pseudo}
            </h3>
            <p className="muted">Choisis la carte :</p>
            <div className="pick-list">
              {pickFor.target.handCount > 0 && (
                <button className="btn" onClick={() => confirmPick(undefined)}>
                  🃏 Carte de la main (au hasard) — {pickFor.target.handCount}
                </button>
              )}
              {pickFor.target.inPlay.map((c) => (
                <button key={c.id} className="btn" onClick={() => confirmPick(c.id)}>
                  {cardLabel(c.name, theme)} (en jeu)
                </button>
              ))}
            </div>
            <button className="btn ghost" onClick={() => setPickFor(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disposition
// ---------------------------------------------------------------------------

/** Position d'un siège sur l'arc supérieur de la table (ellipse, demi-haut). */
function seatPosition(i: number, total: number): React.CSSProperties {
  const frac = total === 1 ? 0.5 : i / (total - 1);
  const angle = Math.PI + frac * Math.PI; // π → 2π : gauche → haut → droite
  // Rayons réduits pour rester dans le terrain (pas de débordement bord/header).
  const x = 50 + 34 * Math.cos(angle);
  const y = 50 + 38 * Math.sin(angle);
  return { left: `${x}%`, top: `${y}%` };
}

/** Transform d'une carte de l'éventail (rotation + position horizontale). */
function fanTransform(i: number, total: number): { transform: string; left: string } {
  const t = total === 1 ? 0 : i / (total - 1) - 0.5; // -0.5 .. 0.5
  const spread = Math.min(64, total * 15); // largeur totale de l'éventail (%)
  const rot = t * 20; // degrés
  const dip = Math.abs(t) * 14; // les cartes extérieures descendent
  return {
    left: `calc(50% + ${t * spread}% )`,
    transform: `translateX(-50%) translateY(${dip}px) rotate(${rot}deg)`,
  };
}

function currentName(game: NonNullable<GameApi['game']>): string {
  const p = game.players.find((x) => x.id === game.currentPlayerId);
  return p?.pseudo ?? '…';
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'draw':
      return 'pioche';
    case 'play':
      return 'jeu';
    case 'discard':
      return 'défausse';
    default:
      return phase;
  }
}

/** Mini-contrôle pour le pouvoir de Sid Ketchum (défausser 2 cartes → +1 PV). */
function SidKetchum({ api, hand, theme }: { api: GameApi; hand: Card[]; theme: Theme }) {
  const [sel, setSel] = useState<string[]>([]);
  function toggle(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : s));
  }
  return (
    <div className="sid-power">
      <span>Sid : défausse 2 cartes → +1 PV</span>
      <div className="sid-cards">
        {hand.map((c) => (
          <button
            key={c.id}
            className={`btn tiny ${sel.includes(c.id) ? 'primary' : ''}`}
            onClick={() => toggle(c.id)}
          >
            {cardLabel(c.name, theme)}
          </button>
        ))}
      </div>
      <button
        className="btn tiny primary"
        disabled={sel.length !== 2}
        onClick={() => {
          api.usePower('sid_heal', sel);
          setSel([]);
        }}
      >
        Soigner
      </button>
    </div>
  );
}
