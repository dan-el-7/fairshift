import type { VNode } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Me } from '../shared/api';
import type { Role } from '../shared/types';
import { Icon } from './components/Icon';
import { AmbientBackdrop } from './components/AmbientBackdrop';
import { Spinner } from './components/Spinner';
import { LanguageHelpButton } from './components/LanguageSheet';
import { OfflineBanner } from './components/OfflineBanner';
import { hasOnboarded, hasSeenIntro, Onboarding } from './components/Onboarding';
import { TextSizeToggle } from './components/TextSizeToggle';
import { ThemeSwitch } from './components/ThemeSwitch';
import { adoptUserLanguage, t, useLang } from './i18n';
import { navigate, navigateLink, type Route, useRoute } from './router';
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

/** The role whose intro should show after login, or null. Callers show the other overlays first. */
function pendingIntroRole(me: Me | null | undefined, dismissed: Role | null): Role | null {
  if (!me || me.role === dismissed || hasSeenIntro(me.role)) return null;
  return me.role;
}

/** Header with the brand, help and text size controls, and log out when signed in. */
function AppHeader({ me, wide }: { me: Me | null | undefined; wide: boolean }) {
  return (
    // `wide` matches main.main-wide, so the bar's contents line up with the page column.
    <header class={wide ? 'app-header is-wide' : 'app-header'}>
      <div class="header-frost" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /></div>
      <div class="app-header-inner">
        <a class="brand" href="#/" onClick={navigateLink}>
          <span class="brand-mark" aria-hidden="true">
            {/* Logomark: an equals sign shifted out of line (fair + shift), cut out of a rounded square. */}
            <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" focusable="false">
              <path
                fill-rule="evenodd"
                d="M6.667 0h10.666a6.667 6.667 0 0 1 6.667 6.667v10.666a6.667 6.667 0 0 1-6.667 6.667H6.667a6.667 6.667 0 0 1-6.667-6.667V6.667a6.667 6.667 0 0 1 6.667-6.667zM6.6 7.3h6.8a1.7 1.7 0 0 1 0 3.4H6.6a1.7 1.7 0 0 1 0-3.4zM10.6 13.3h6.8a1.7 1.7 0 0 1 0 3.4h-6.8a1.7 1.7 0 0 1 0-3.4z"
              />
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
      </div>
    </header>
  );
}

interface OverlayProps {
  welcome: boolean;
  firstVisit: boolean;
  introRole: Role | null;
  role: Role | null;
  onReplayDone: () => void;
  onFirstDone: () => void;
  onIntroDone: (role: Role) => void;
}

/** Shows at most one onboarding overlay, in priority order: replay, first visit, then a role intro. */
function Overlay({ welcome, firstVisit, introRole, role, onReplayDone, onFirstDone, onIntroDone }: OverlayProps) {
  if (welcome) return <Onboarding key="replay" mode="replay" role={role} onDone={onReplayDone} />;
  if (firstVisit) return <Onboarding key="first" mode="first" onDone={onFirstDone} />;
  if (introRole) {
    return (
      <Onboarding
        key={`intro-${introRole}`}
        mode="intro"
        role={introRole}
        greet
        onDone={() => onIntroDone(introRole)}
      />
    );
  }
  return null;
}

export function App() {
  const lang = useLang();
  const route = useRoute();
  const me = useSession();
  const mainRef = useRef<HTMLElement>(null);
  const root = route.path.split('/').find(Boolean);
  const publicLink = root === 'verify' || root === 'track';

  // Overlay priority: #/welcome replay, then the first-visit flow, then a role intro after login. Only one shows at a time.
  const welcome = root === 'welcome';
  const [firstVisit, setFirstVisit] = useState(() => !hasOnboarded());
  const [introDismissed, setIntroDismissed] = useState<Role | null>(null);
  const introRole = pendingIntroRole(me, introDismissed);

  useEffect(() => {
    void ensureSession();
  }, []);

  // A new login starts with no dismissed intro, so a demo login after another one still shows its tour.
  useEffect(() => {
    setIntroDismissed(null);
  }, [me]);

  // A worker's profile language wins unless they picked one themselves on this device.
  useEffect(() => {
    if (me) adoptUserLanguage(me.language);
  }, [me?.id]);

  useEffect(() => {
    document.title = t('app.name');
  }, [lang]);

  // Move focus to the page heading area on navigation so screen readers announce the change.
  const firstRender = useRef(true);
  useLayoutEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    mainRef.current?.focus({ preventScroll: true });
  }, [route.path]);

  // The overlay's focused control is removed when it closes; send focus to the page instead of the body.
  const focusMain = () => mainRef.current?.focus({ preventScroll: true });

  const mainClass = [root === 'a' ? 'main-wide has-admin-nav' : '', root === 'w' ? 'has-bottom-nav' : ''].filter(Boolean).join(' ');

  return (
    <>
      <AmbientBackdrop active={!welcome && (publicLink || (!firstVisit && introRole === null))} />
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
      <AppHeader me={me} wide={root === 'a'} />
      <Overlay
        welcome={welcome}
        firstVisit={!publicLink && firstVisit}
        introRole={publicLink ? null : introRole}
        role={me?.role ?? null}
        onReplayDone={() => {
          setFirstVisit(false);
          navigate('/');
          focusMain();
        }}
        onFirstDone={() => {
          setFirstVisit(false);
          focusMain();
        }}
        onIntroDone={(role) => {
          setIntroDismissed(role);
          focusMain();
        }}
      />
      <main id="main" ref={mainRef} tabIndex={-1} class={mainClass || undefined} onClick={navigateLink}>
        <OfflineBanner />
        <Suspense fallback={<Spinner />}>
          {/* Worker pages key their own wrapper (see WorkerShell) so the fixed bottom nav is not inside a transformed box. */}
          {root === 'w' || root === 'a' ? (
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
