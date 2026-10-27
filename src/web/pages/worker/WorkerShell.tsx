import type { VNode } from 'preact';
import { useEffect } from 'preact/hooks';
import type { Me } from '../../../shared/api';
import { Spinner } from '../../components/Spinner';
import { navigate } from '../../router';
import { ensureSession, useSession } from '../../session';

/**
 * Guards a worker page: waits for the session, sends admins to their area and
 * logged-out visitors to the start page, and otherwise renders `render(me)`.
 */
export function WorkerShell({ render }: { render: (me: Me) => VNode }) {
  const me = useSession();

  useEffect(() => {
    void ensureSession();
  }, []);

  useEffect(() => {
    if (me === null) navigate('/');
    else if (me && me.role !== 'worker') navigate('/a');
  }, [me]);

  if (!me || me.role !== 'worker') return <Spinner />;
  return render(me);
}
