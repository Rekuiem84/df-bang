import { useGame } from './hooks/useGame';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Game } from './screens/Game';
import { GameOver } from './screens/GameOver';
import { DecisionModal } from './components/DecisionModal';
import { VoteModal } from './components/VoteModal';

export function App() {
  const api = useGame();

  return (
    <div className="app">
      {!api.connected && (
        <div className="conn-banner">Connexion au serveur…</div>
      )}
      {api.error && (
        <div className="error-toast" onClick={api.clearError}>
          {api.error}
        </div>
      )}

      {api.screen === 'home' && <Home api={api} />}
      {api.screen === 'lobby' && <Lobby api={api} />}
      {api.screen === 'game' && <Game api={api} />}
      {api.screen === 'over' && <GameOver api={api} />}

      {api.decisions.length > 0 ? (
        <DecisionModal api={api} />
      ) : (
        api.votes.length > 0 && <VoteModal api={api} />
      )}
    </div>
  );
}
