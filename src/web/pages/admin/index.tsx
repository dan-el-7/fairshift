import type { VNode } from 'preact';
import { useEffect } from 'preact/hooks';
import { Spinner } from '../../components/Spinner';
import { t, type TKey, useLang } from '../../i18n';
import { navigate } from '../../router';
import { ensureSession, useSession } from '../../session';
import Dashboard from './Dashboard';
import Feedback from './Feedback';
import Qr from './Qr';
import Reports from './Reports';
import Workers from './Workers';

const SECTIONS: Array<{ path: string; label: TKey }> = [
  { path: '/a', label: 'admin.nav.dashboard' },
  { path: '/a/reports', label: 'admin.nav.reports' },
  { path: '/a/qr', label: 'admin.nav.qr' },
  { path: '/a/workers', label: 'admin.nav.workers' },
  { path: '/a/feedback', label: 'admin.nav.feedback' },
];

const PAGES: Record<string, () => VNode> = {
  '/a': () => <Dashboard />,
  '/a/reports': () => <Reports />,
  '/a/qr': () => <Qr />,
  '/a/workers': () => <Workers />,
  '/a/feedback': () => <Feedback />,
};

/** Admin area: guards the role, shows the sub-navigation and the selected page. Pages are lazy-loaded. */
export default function AdminPage({ path }: { path: string }) {
  useLang();
  const me = useSession();

  useEffect(() => {
    void ensureSession();
  }, []);

  useEffect(() => {
    if (me === null) navigate('/');
    else if (me && me.role !== 'admin') navigate('/w');
  }, [me]);

  if (!me || me.role !== 'admin') return <Spinner />;

  const render = PAGES[path];
  return (
    <div class="stack">
      <nav class="admin-nav" aria-label={t('admin.nav.label')}>
        <ul>
          {SECTIONS.map((section) => {
            const current = section.path === path;
            return (
              <li key={section.path}>
                <a href={`#${section.path}`} aria-current={current ? 'page' : undefined}>
                  {t(section.label)}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
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
  );
}
