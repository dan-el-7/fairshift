import type { VNode } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import type { Me } from '../shared/api';
import { Spinner } from './components/Spinner';
import { LANGUAGE_LABEL, LANGUAGES, setLang, t, useLang } from './i18n';
import { type Route, useRoute } from './router';
import { ensureSession, logout, useSession } from './session';
import { WorkerShell } from './pages/worker/WorkerShell';
import Landing from './pages/public/Landing';
import Track from './pages/public/Track';
import Verify from './pages/public/Verify';
import type { Language } from '../shared/types';

// Worker pages and the admin area are split into their own chunks to keep the first load small.
const AdminPage = lazy(() => import('./pages/admin/index'));
const Home = lazy(() => import('./pages/worker/Home'));
const Attendance = lazy(() => import('./pages/worker/Attendance'));
const Pay = lazy(() => import('./pages/worker/Pay'));
const Report = lazy(() => import('./pages/worker/Report'));
const Skills = lazy(() => import('./pages/worker/Skills'));
const Feedback = lazy(() => import('./pages/worker/Feedback'));

function workerPage(sub: string | undefined): ((me: Me) => VNode) | null {
  switch (sub) {
    case undefined:
      return (me) => <Home me={me} />;
    case 'attendance':
      return (me) => <Attendance me={me} />;
    case 'pay':
      return (me) => <Pay me={me} />;
    case 'report':
      return (me) => <Report me={me} />;
    case 'skills':
      return (me) => <Skills me={me} />;
    case 'feedback':
      return (me) => <Feedback me={me} />;
    default:
      return null;
  }
}

function NotFound() {
  return (
    <section class="card stack">
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <a class="btn btn-primary" href="#/">
        {t('nav.home')}
      </a>
    </section>
  );
}

function Routes({ route }: { route: Route }) {
  const [root, sub] = route.path.split('/').filter(Boolean);
  if (!root) return <Landing />;
  if (root === 'w') {
    const render = workerPage(sub);
    return render ? <WorkerShell render={render} /> : <NotFound />;
  }
  if (root === 'a') return <AdminPage path={route.path} />;
  if (root === 'track') return <Track />;
  if (root === 'verify') return <Verify />;
  return <NotFound />;
}

export function App() {
  const lang = useLang();
  const route = useRoute();
  const me = useSession();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void ensureSession();
  }, []);

  useEffect(() => {
    document.title = t('app.name');
  }, [lang]);

  // Move focus to the page heading area on navigation so screen readers announce the change.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [route.path]);

  return (
    <>
      <a
        class="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        {t('nav.skip')}
      </a>
      <header class="app-header">
        <a class="brand" href="#/">
          {t('app.name')}
        </a>
        <div class="header-actions">
          <label class="visually-hidden" for="lang-select">
            {t('app.langLabel')}
          </label>
          <select
            id="lang-select"
            class="lang-select"
            value={lang}
            onChange={(event) => setLang((event.currentTarget as HTMLSelectElement).value as Language)}
          >
            {LANGUAGES.map((code) => (
              <option key={code} value={code} lang={code}>
                {LANGUAGE_LABEL[code]}
              </option>
            ))}
          </select>
          {me ? (
            <button type="button" class="btn btn-small" onClick={() => void logout()}>
              {t('nav.logout')}
            </button>
          ) : null}
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        <Suspense fallback={<Spinner />}>
          <Routes route={route} />
        </Suspense>
      </main>
    </>
  );
}
