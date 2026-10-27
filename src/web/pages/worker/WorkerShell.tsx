import type { VNode } from 'preact';
import { useEffect } from 'preact/hooks';
import type { Me } from '../../../shared/api';
import { Icon, type IconName } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { t, type TKey } from '../../i18n';
import { navigate, useRoute } from '../../router';
import { ensureSession, useSession } from '../../session';

/** The five worker sections, with the existing labels and icons. */
/** `short` is a one-word label that fits a phone-width tab in every language; `label` is the full name. */
const NAV: { path: string; icon: IconName; label: TKey; short: TKey }[] = [
  { path: '/w', icon: 'home', label: 'nav.home', short: 'nav.short.home' },
  { path: '/w/attendance', icon: 'checkin', label: 'attendance.title', short: 'nav.short.attendance' },
  { path: '/w/pay', icon: 'pay', label: 'pay.title', short: 'nav.short.pay' },
  { path: '/w/report', icon: 'report', label: 'report.title', short: 'nav.short.report' },
  { path: '/w/skills', icon: 'skills', label: 'skills.title', short: 'nav.short.skills' },
];

function WorkerNav() {
  const route = useRoute();
  return (
    <nav class="worker-nav">
      {NAV.map((item) => {
        const current = item.path === route.path;
        return (
          <a
            key={item.path}
            href={`#${item.path}`}
            aria-current={current ? 'page' : undefined}
            aria-label={t(item.label)}
            title={t(item.label)}
          >
            <span class="nav-pill">
              <Icon name={item.icon} size={20} />
            </span>
            <span class="nav-text" aria-hidden="true">
              {t(item.short)}
            </span>
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
    const role = me?.role; // undefined while the session loads
    if (me === null) navigate('/');
    else if (role !== undefined && role !== 'worker') navigate('/a');
  }, [me]);

  if (me?.role !== 'worker') return <Spinner />;
  return (
    <>
      <WorkerNav />
      <div key={route.path} class="route-view">
        {render(me)}
      </div>
    </>
  );
}
