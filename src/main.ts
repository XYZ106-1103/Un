import './styles/main.css';
import { GameApp } from '@/game/Game';
import { t } from '@/systems/LocaleSystem';

function showFatalError(error: unknown): void {
  console.error('[main] fatal startup error', error);
  const box = document.createElement('div');
  box.className = 'fatal-error';
  box.setAttribute('role', 'alert');
  const title = document.createElement('p');
  title.textContent = t('error.fatal');
  const detail = document.createElement('p');
  detail.textContent = t('error.detail');
  box.append(title, detail);
  document.body.append(box);
}

function start(): void {
  const root = document.getElementById('game-stage');
  if (!root) throw new Error('#game-stage element missing from index.html');
  const app = new GameApp(root);

  // Exposed for the smoke test and for poking at things from devtools.
  (window as unknown as { __unclaimed: GameApp }).__unclaimed = app;

  // Phaser does not support hot-swapping scenes cleanly: rebuild the game on HMR.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => app.destroy());
  }
}

try {
  start();
} catch (error) {
  showFatalError(error);
}
