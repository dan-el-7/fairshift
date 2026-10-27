import type { VNode } from 'preact';
import { useEffect } from 'preact/hooks';
import type { Me } from '../../../shared/api';
import { Icon, type IconName } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { t, type TKey } from '../../i18n';
import { navigate, useRoute } from '../../router';
import { ensureSession, useSession } from '../../session';

/** The five worker sections, with the existing labels and icons. */
const NAV: Array<{ path: string; icon: IconName; label: TKey }> = [
  { path: '/w', icon: 'home', label: 'nav.home' },
  { path: '/w/attendance', icon: 'checkin', label: 'attendance.title' },
  { path: '/w/pay', icon: 'pay', label: 'pay.title' },
  { path: '/w/report', icon: 'report', label: 'report.title' },
  { path: '/w/skills', icon: 'skills', label: 'skills.title' },
];

function WorkerNav() {
  const route = useRoute();
  return (
    <nav class="worker-nav">
      {NAV.map((item) => {
        const current = item.path === route.path;
        return (
          <a key={item.path} href={`#${item.path}`} aria-current={current ? 'page' : undefined}>
            <span class="nav-pill">
              <Icon name={item.icon} size={20} />
            </span>
            <span class="nav-text">{t(item.label)}</span>
          </a>
        );
      })}
    </nav>
  );
}

/**
 * Guards a worker page: waits for the session, sends admins to their area and
 * logged-out visitors to the start page, and otherwise renders `render(me)` with the section navigation.
 */
export function WorkerShell({ render }: { render: (me: Me) => VNode }) {
  const me = useSession();
  const route = useRoute();

  useEffect(() => {
    void ensureSession();
  }, []);

  useEffect(() => {
    if (me === null) navigate('/');
    else if (me && me.role !== 'worker') navigate('/a');
  }, [me]);

  if (!me || me.role !== 'worker') return <Spinner />;
  return (
    <>
      <WorkerNav />
      <div key={route.path} class="route-view">
        {render(me)}
      </div>
    </>
  );
}
