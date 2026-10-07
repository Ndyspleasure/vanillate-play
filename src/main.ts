import '@fontsource-variable/fredoka/wght.css';
import '@fontsource-variable/nunito/wght.css';
import './styles/main.css';
import { app } from './app/context';
import type { Screen } from './app/router';
import { toast } from './ui/components';
import { h } from './ui/dom';
import { t } from './ui/i18n';
import { detailScreen } from './ui/screens/detail';
import { homeScreen } from './ui/screens/home';
import { libraryScreen } from './ui/screens/library';
import { notFoundScreen } from './ui/screens/notfound';
import { playScreen } from './ui/screens/play';
import { privacyScreen } from './ui/screens/privacy';
import { settingsScreen } from './ui/screens/settings';
import { statsScreen } from './ui/screens/stats';

const root = document.getElementById('app')!;
let cameraIdleTimer: ReturnType<typeof setTimeout> | null = null;

app.router
  .add('/', () => homeScreen())
  .add('/games', (m) => libraryScreen(m))
  .add('/games/:id', (m) => detailScreen(m))
  .add('/play/:id', (m) => playScreen(m))
  .add('/settings', () => settingsScreen())
  .add('/stats', () => statsScreen())
  .add('/privacy', () => privacyScreen())
  .notFound(() => notFoundScreen());

app.router.onChange = (screen: Screen, path: string) => {
  root.replaceChildren(screen.el);
  document.title = screen.title;
  document.body.classList.toggle('immersive', !!screen.immersive);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  else window.scrollTo(0, 0);
  (screen.el.querySelector('h1') as HTMLElement | null)?.setAttribute('tabindex', '-1');

  // Keep the camera alive while choosing the next game; turn it off when the player wanders away.
  if (cameraIdleTimer) clearTimeout(cameraIdleTimer);
  cameraIdleTimer = null;
  const inGameFlow = path.startsWith('/play') || path.startsWith('/games');
  if (!inGameFlow && app.session.mode !== 'off') {
    cameraIdleTimer = setTimeout(() => app.session.stop(), 60_000);
  }
};

app.router.start();

// Connectivity hints (the game itself works offline once cached).
window.addEventListener('offline', () => toast(t('offline'), 'warn', 4000));

// PWA install prompt
type InstallEvent = Event & { prompt: () => Promise<void> };
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  const evt = e as InstallEvent;
  const btn = h(
    'button',
    {
      class: 'install-btn',
      type: 'button',
      onclick: () => {
        void evt.prompt();
        btn.remove();
      },
    },
    '⬇ ',
    t('install'),
  );
  document.body.appendChild(btn);
  setTimeout(() => btn.remove(), 20_000);
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is optional */
    });
  });
}

if (import.meta.env.DEV) {
  // Test/debug handle for local development only (stripped from production builds).
  (window as unknown as { __vm: typeof app }).__vm = app;
}
