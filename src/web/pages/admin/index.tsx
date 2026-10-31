import type { VNode } from 'preact';
import { useEffect } from 'preact/hooks';
import { Icon, type IconName } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { t, type TKey, useLang } from '../../i18n';
import { navigate } from '../../router';
import { ensureSession, useSession } from '../../session';
import Dashboard from './Dashboard';
import Feedback from './Feedback';
import Qr from './Qr';
import Reports from './Reports';
import Workers from './Workers';

const SECTIONS: { path: string; label: TKey; short: TKey; icon: IconName }[] = [
  { path: '/a', label: 'admin.nav.dashboard', short: 'admin.nav.short.dashboard', icon: 'grid' },
  { path: '/a/reports', label: 'admin.nav.reports', short: 'admin.nav.short.reports', icon: 'file' },
  { path: '/a/qr', label: 'admin.nav.qr', short: 'admin.nav.short.qr', icon: 'qr' },
  { path: '/a/workers', label: 'admin.nav.workers', short: 'admin.nav.short.workers', icon: 'users' },
  { path: '/a/feedback', label: 'admin.nav.feedback', short: 'admin.nav.short.feedback', icon: 'feedback' },
];

const PAGES: Record<string, () => VNode> = {
  '/a': () => <Dashboard />,
  '/a/reports': () => <Reports />,
  '/a/qr': () => <Qr />,
  '/a/workers': () => <Workers />,
  '/a/feedback': () => <Feedback />,
};

/** Admin area: guards the role, shows the sub-navigation (sidebar on wide screens, tab bar on small) and the selected page. */
export default function AdminPage({ path }: { path: string }) {
  useLang();
  const me = useSession();

  useEffect(() => {
    void ensureSession();
  }, []);

  useEffect(() => {
    const role = me?.role; // undefined while the session loads
    if (me === null) navigate('/');
    else if (role !== undefined && role !== 'admin') navigate('/w');
  }, [me]);

  if (me?.role !== 'admin') return <Spinner />;

  const render = PAGES[path];
  return (
    <div class="admin-layout">
      <nav class="admin-nav" aria-label={t('admin.nav.label')}>
        <ul>
          {SECTIONS.map((section) => {
            const current = section.path === path;
            return (
              <li key={section.path}>
                <a href={`#${section.path}`} aria-current={current ? 'page' : undefined}
                  aria-label={t(section.label)} title={t(section.label)}>
                  <span class="nav-pill" aria-hidden="true"><Icon name={section.icon} size={20} /></span>
                  <span class="admin-nav-label" aria-hidden="true">{t(section.label)}</span>
                  <span class="admin-nav-short" aria-hidden="true">{t(section.short)}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div key={path} class="admin-content stack route-view">
        {render ? (
          render()
        ) : (
          <section class="card stack">
            <h1>{t('notFound.title')}</h1>
            <p>{t('notFound.body')}</p>
            <a class="btn btn-primary" href="#/a">
              {t('admin.nav.dashboard')}
            </a>
          </section>
        )}
      </div>
    </div>
  );
}
