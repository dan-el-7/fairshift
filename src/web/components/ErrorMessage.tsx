import { errorMessage } from '../api';
import { t } from '../i18n';
import { Banner } from './Banner';

export function ErrorMessage({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Banner tone="danger">
      <p>{errorMessage(error)}</p>
      {onRetry ? (
        <button type="button" class="btn" onClick={onRetry}>
          {t('common.retry')}
        </button>
      ) : null}
    </Banner>
  );
}
