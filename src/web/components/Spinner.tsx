import { t } from '../i18n';

/** Loading placeholder: skeleton blocks, announced once as a status update. */
export function Spinner({ label }: { label?: string }) {
  return (
    <div class="skeleton-stack" role="status">
      <span class="visually-hidden">{label ?? t('common.loading')}</span>
      <span class="skeleton sk-card" aria-hidden="true" />
      <span class="skeleton sk-line" aria-hidden="true" />
    </div>
  );
}
