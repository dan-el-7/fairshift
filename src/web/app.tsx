import type { VNode } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Me } from '../shared/api';
import type { Role } from '../shared/types';
import { Icon } from './components/Icon';
import { Spinner } from './components/Spinner';
import { LanguageHelpButton } from './components/LanguageSheet';
import { OfflineBanner } from './components/OfflineBanner';
import { hasOnboarded, hasSeenIntro, Onboarding } from './components/Onboarding';
import { TextSizeToggle } from './components/TextSizeToggle';
import { ThemeSwitch } from './components/ThemeSwitch';
import { adoptUserLanguage, t, useLang } from './i18n';
import { navigate, type Route, useRoute } from './router';
import { ensureSession, logout, useSession } from './session';
import { WorkerShell } from './pages/worker/WorkerShell';
import Landing from './pages/public/Landing';
import Track from './pages/public/Track';
import Verify from './pages/public/Verify';

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
  if (root === 'welcome') return <Landing />;
  return <NotFound />;
}

export function App() {
  const lang = useLang();
  const route = useRoute();
  const me = useSession();
  const mainRef = useRef<HTMLElement>(null);
  const root = route.path.split('/').filter(Boolean)[0];

  // Overlay priority: #/welcome replay, then the first-visit flow, then a role intro after login. Only one shows at a time.
  const welcome = root === 'welcome';
  const [firstVisit, setFirstVisit] = useState(() => !hasOnboarded());
  const [introDismissed, setIntroDismissed] = useState<Role | null>(null);
  const introRole: Role | null =
    !welcome && !firstVisit && me && me.role !== introDismissed && !hasSeenIntro(me.role) ? me.role : null;

  useEffect(() => {
    void ensureSession();
  }, []);

  // A worker's profile language wins unless they picked one themselves on this device.
  useEffect(() => {
    if (me) adoptUserLanguage(me.language);
  }, [me?.id]);

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

  const mainClass = [root === 'a' ? 'main-wide' : '', root === 'w' ? 'has-bottom-nav' : ''].filter(Boolean).join(' ');

  return (
    <>
      <div class="app-bg" aria-hidden="true">
        <div class="app-bg-blobs">
          <span class="app-blob app-blob-teal" />
          <span class="app-blob app-blob-mint" />
          <span class="app-blob app-blob-indigo" />
          <span class="app-blob app-blob-amber" />
        </div>
      </div>
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
          <span class="brand-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" focusable="false">
              <path d="M5.5 12.5l4.2 4.2L18.5 7.5" />
            </svg>
          </span>
          <span class="brand-name">{t('app.name')}</span>
        </a>
        <div class="header-actions">
          <LanguageHelpButton />
          <TextSizeToggle />
          {me ? (
            <button type="button" class="btn btn-ghost btn-small" onClick={() => void logout()}>
              <Icon name="logout" size={20} />
              <span class="collapse-sm">{t('nav.logout')}</span>
            </button>
          ) : null}
        </div>
      </header>
      {welcome ? (
        <Onboarding
          key="replay"
          mode="replay"
          role={me?.role ?? null}
          onDone={() => {
            setFirstVisit(false);
            navigate('/');
          }}
        />
      ) : firstVisit ? (
        <Onboarding key="first" mode="first" onDone={() => setFirstVisit(false)} />
      ) : introRole ? (
        <Onboarding key={`intro-${introRole}`} mode="intro" role={introRole} onDone={() => setIntroDismissed(introRole)} />
      ) : null}
      <main id="main" ref={mainRef} tabIndex={-1} class={mainClass || undefined}>
        <OfflineBanner />
        <Suspense fallback={<Spinner />}>
          {/* Worker pages key their own wrapper (see WorkerShell) so the fixed bottom nav is not inside a transformed box. */}
          {root === 'w' ? (
            <Routes route={route} />
          ) : (
            <div key={route.path} class="route-view">
              <Routes route={route} />
            </div>
          )}
        </Suspense>
        <footer class="app-footer">
          <span class="app-footer-tag">{t('footer.tagline')}</span>
          <ThemeSwitch />
        </footer>
      </main>
    </>
  );
}
