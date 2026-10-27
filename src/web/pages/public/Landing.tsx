import { useEffect, useState } from 'preact/hooks';
import type { Me, Persona } from '../../../shared/api';
import type { Language } from '../../../shared/types';
import { api, errorMessage } from '../../api';
import { Banner } from '../../components/Banner';
import { Icon, type IconName } from '../../components/Icon';
import { forgetIntro } from '../../components/Onboarding';
import { Tile } from '../../components/Tile';
import { LANGUAGE_LABEL, LANGUAGES, setLang, t, useLang } from '../../i18n';
import { navigate } from '../../router';
import { setSession } from '../../session';

/** Icon for each industry on the demo login list. */
const INDUSTRY_ICON: Record<string, IconName> = { construction: 'hardhat', college: 'cap' };

/** Personas grouped by industry, in the order the server lists them. */
function groupByIndustry(list: Persona[]): { industry: string; siteName: string; people: Persona[] }[] {
  const groups = new Map<string, { industry: string; siteName: string; people: Persona[] }>();
  for (const persona of list) {
    const group = groups.get(persona.industry) ?? { industry: persona.industry, siteName: persona.siteName, people: [] };
    group.people.push(persona);
    groups.set(persona.industry, group);
  }
  return [...groups.values()];
}

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
      // A demo login always shows that role's tour (still skippable), so every visitor sees it.
      forgetIntro(me.role);
      setSession(me);
      navigate(me.role === 'admin' ? '/a' : '/w');
    } catch (err) {
      setLoginError(errorMessage(err));
      setBusyId(null);
    }
  }

  return (
    <div class="stack">
      <section class="hero-landing" aria-labelledby="landing-title">
        <h1 id="landing-title">{t('app.name')}</h1>
        <p>{t('app.description')}</p>
      </section>

      <section class="stack" aria-labelledby="lang-title">
        <h2 id="lang-title">{t('landing.chooseLanguage')}</h2>
        <div class="lang-grid" role="group" aria-label={t('landing.chooseLanguage')}>
          {LANGUAGES.map((code: Language) => (
            <button
              key={code}
              type="button"
              class="lang-card"
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
        {personas === null && !loadError ? (
          <div class="skeleton-stack" role="status">
            <span class="visually-hidden">{t('landing.personasLoading')}</span>
            <span class="skeleton sk-card" aria-hidden="true" />
          </div>
        ) : null}
        {loadError ? <Banner tone="danger">{t('landing.personasError')}</Banner> : null}
        {loginError ? <Banner tone="danger">{loginError}</Banner> : null}

        {groupByIndustry(personas ?? []).map((group) => (
          <div class="persona-group" key={group.industry}>
            <div class="group-head">
              <span class="group-icon" aria-hidden="true">
                <Icon name={INDUSTRY_ICON[group.industry] ?? 'user'} size={20} />
              </span>
              <span>{group.siteName}</span>
            </div>
            {group.people.map((persona) => (
              <button
                key={persona.id}
                type="button"
                class="btn persona"
                disabled={busyId !== null}
                onClick={() => void login(persona)}
              >
                <span class="persona-main">
                  <strong>{persona.name}</strong>
                  {busyId === persona.id ? <span class="muted">{t('landing.loggingIn')}</span> : null}
                </span>
                <span class={`role-chip${persona.role === 'admin' ? ' is-admin' : ''}`}>
                  {persona.role === 'admin' ? t('landing.roleAdmin') : t('landing.roleWorker')}
                </span>
              </button>
            ))}
          </div>
        ))}
      </section>

      <section class="stack" aria-labelledby="quick-title">
        <h2 id="quick-title">{t('landing.quick')}</h2>
        <div class="tile-grid quick-links">
          <Tile href="#/track" icon="track" label={t('nav.trackReport')} />
          <Tile href="#/verify" icon="verify" label={t('nav.verifyPassport')} />
          <Tile href="#/welcome" icon="globe" label={t('landing.replayIntro')} />
        </div>
      </section>
    </div>
  );
}
