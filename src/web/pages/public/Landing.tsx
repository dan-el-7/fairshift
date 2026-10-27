import { useEffect, useState } from 'preact/hooks';
import type { Me, Persona } from '../../../shared/api';
import type { Language } from '../../../shared/types';
import { api, errorMessage } from '../../api';
import { Banner } from '../../components/Banner';
import { Icon } from '../../components/Icon';
import { SpeakButton } from '../../components/SpeakButton';
import { LANGUAGE_LABEL, LANGUAGES, setLang, t, useLang } from '../../i18n';
import { navigate } from '../../router';
import { setSession } from '../../session';

export default function Landing() {
  const lang = useLang();
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<Persona[]>('/api/auth/personas')
      .then((list) => {
        if (alive) setPersonas(list);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function login(persona: Persona) {
    setBusyId(persona.id);
    setLoginError(null);
    try {
      const me = await api.post<Me>('/api/auth/demo', { personaId: persona.id });
      setSession(me);
      navigate(me.role === 'admin' ? '/a' : '/w');
    } catch (err) {
      setLoginError(errorMessage(err));
      setBusyId(null);
    }
  }

  return (
    <div class="stack">
      <section class="stack" aria-labelledby="landing-title">
        <h1 id="landing-title">{t('app.name')}</h1>
        <p>{t('app.description')}</p>
      </section>

      <section class="card stack" aria-labelledby="lang-title">
        <h2 id="lang-title">{t('landing.chooseLanguage')}</h2>
        <div class="chips" role="group" aria-label={t('landing.chooseLanguage')}>
          {LANGUAGES.map((code: Language) => (
            <button
              key={code}
              type="button"
              class="chip"
              lang={code}
              aria-pressed={code === lang}
              onClick={() => setLang(code)}
            >
              {LANGUAGE_LABEL[code]}
            </button>
          ))}
        </div>
      </section>

      <section class="stack" aria-labelledby="demo-title">
        <h2 id="demo-title">{t('landing.demoTitle')}</h2>
        <p class="muted">{t('landing.demoHelp')}</p>
        {personas === null && !loadError ? <p role="status">{t('landing.personasLoading')}</p> : null}
        {loadError ? <Banner tone="danger">{t('landing.personasError')}</Banner> : null}
        {loginError ? <Banner tone="danger">{loginError}</Banner> : null}
        <div class="stack">
          {(personas ?? []).map((persona) => (
            <button
              key={persona.id}
              type="button"
              class="btn btn-block persona"
              disabled={busyId !== null}
              onClick={() => void login(persona)}
            >
              <span>
                <strong>{persona.name}</strong>
                <br />
                <span class="muted">
                  {persona.role === 'admin' ? t('landing.roleAdmin') : t('landing.roleWorker')} · {persona.siteName}
                </span>
              </span>
              {busyId === persona.id ? <span class="visually-hidden">{t('landing.loggingIn')}</span> : null}
            </button>
          ))}
        </div>
      </section>

      <section class="stack" aria-labelledby="quick-title">
        <h2 id="quick-title">{t('landing.quick')}</h2>
        <div class="tile-grid">
          <div class="tile">
            <a class="tile-link" href="#/track">
              <Icon name="track" size={36} />
              <span>{t('nav.trackReport')}</span>
            </a>
            <div class="tile-foot">
              <SpeakButton text={t('nav.trackReport')} />
            </div>
          </div>
          <div class="tile">
            <a class="tile-link" href="#/verify">
              <Icon name="verify" size={36} />
              <span>{t('nav.verifyPassport')}</span>
            </a>
            <div class="tile-foot">
              <SpeakButton text={t('nav.verifyPassport')} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
