import { useState } from 'preact/hooks';
import type { PassportVerify } from '../../../shared/api';
import { Banner } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { SpeakButton } from '../../components/SpeakButton';
import { Spinner } from '../../components/Spinner';
import { formatDay, t, type TKey } from '../../i18n';
import { navigate, useRoute } from '../../router';
import { useApiData } from '../../useApiData';

/** Accepts a full passport link, a "token=..." fragment, or the bare token. */
function tokenFrom(input: string): string {
  const value = input.trim();
  const match = /[?&]token=([^&\s]+)/.exec(value);
  const raw = match?.[1] ?? value;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function Verify() {
  const route = useRoute();
  const token = route.query.get('token');
  const check = useApiData<PassportVerify>(token ? `/api/passport/verify?token=${encodeURIComponent(token)}` : null);
  const [paste, setPaste] = useState('');

  return (
    <div class="stack">
      <h1>{t('verify.title')}</h1>

      <form
        class="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          const next = tokenFrom(paste);
          if (next) navigate(`/verify?token=${encodeURIComponent(next)}`);
        }}
      >
        <div class="field">
          <label class="field-label" for="passport-paste">
            {t('verify.paste')}
          </label>
          <input
            id="passport-paste"
            type="text"
            autocomplete="off"
            spellcheck={false}
            value={paste}
            onInput={(event) => setPaste((event.currentTarget).value)}
          />
        </div>
        <div class="row">
          <button type="submit" class="btn btn-primary">
            <Icon name="verify" size={22} />
            {t('verify.check')}
          </button>
          <SpeakButton text={t('verify.check')} />
        </div>
      </form>

      {!token ? <p class="muted">{t('verify.noToken')}</p> : null}
      {token && check.loading ? <Spinner /> : null}
      {token && check.error ? <ErrorMessage error={check.error} onRetry={check.reload} /> : null}

      {check.data && check.data.valid && check.data.payload ? (
        <section class="card stack" aria-labelledby="verify-result">
          <Banner tone="success" title={t('verify.valid')} titleId="verify-result">
            {t('verify.worker', { name: check.data.payload.workerName })}
            <br />
            {t('verify.issuedAt', { date: formatDay(check.data.payload.issuedAt.slice(0, 10)) })}
          </Banner>
          <h2>{t('verify.entries')}</h2>
          <ul class="entries">
            {check.data.payload.entries.map((entry, index) => (
              <li key={`${entry.title}-${index}`}>
                <strong>{entry.title}</strong>
                <br />
                <span class="muted">
                  {t(`passport.kind.${entry.kind}` as TKey)} · {entry.issuer} · {formatDay(entry.issuedOn)}
                  {entry.hours ? ` · ${entry.hours} h` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {check.data && !check.data.valid ? <Banner tone="danger" title={t('verify.invalid')} /> : null}
    </div>
  );
}
