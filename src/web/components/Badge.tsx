import type { Severity } from '../../shared/types';
import { t, type TKey } from '../i18n';

/** Priority badge. The text label carries the meaning; colour only reinforces it. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span class={`badge badge-${severity}`}>{t(`severity.${severity}` as TKey)}</span>;
}
