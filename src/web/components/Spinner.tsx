import { t } from '../i18n';

export function Spinner({ label }: { label?: string }) {
  return (
    <div class="spinner" role="status">
      <span class="spinner-dot" aria-hidden="true" />
      <span class="visually-hidden">{label ?? t('common.loading')}</span>
    </div>
  );
}
