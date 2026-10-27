import type { Context } from 'hono';
import { INDUSTRIES } from '../../shared/industries';
import type { IndustryConfig, Site, Worker } from '../../shared/types';
import type { Me, Persona } from '../../shared/api';
import type { AppEnv } from '../middleware/auth';
import type { Repo } from '../store/repo';

/** The signed-in person, their site and the site's industry config. */
export interface SessionContext {
  worker: Worker;
  site: Site;
  cfg: IndustryConfig;
}

/**
 * Loads the person behind the session cookie. Returns null when the session points at someone
 * who no longer exists or whose role or site no longer matches the token.
 */
export async function sessionContext(c: Context<AppEnv>, repo: Repo): Promise<SessionContext | null> {
  const user = c.get('user');
  if (!user) return null;
  const worker = await repo.getWorker(user.id);
  if (worker?.role !== user.role || worker.siteId !== user.siteId) return null;
  const site = await repo.getSite(worker.siteId);
  if (!site) return null;
  return { worker, site, cfg: INDUSTRIES[site.industry] };
}

/** Demo personas: the first worker and the admin of every site. */
export async function listPersonas(repo: Repo): Promise<Persona[]> {
  const personas: Persona[] = [];
  for (const site of await repo.listSites()) {
    const people = await repo.listWorkers(site.id);
    const worker = people.find((p) => p.role === 'worker');
    const admin = people.find((p) => p.role === 'admin');
    for (const person of [worker, admin]) {
      if (!person) continue;
      personas.push({
        id: person.id,
        name: person.name,
        role: person.role,
        industry: site.industry,
        siteName: site.name,
        language: person.language,
      });
    }
  }
  return personas;
}

/** The `Me` payload for a person and their site. Null when the site is missing. */
export async function loadMe(repo: Repo, worker: Worker): Promise<Me | null> {
  const site = await repo.getSite(worker.siteId);
  if (!site) return null;
  return {
    id: worker.id,
    name: worker.name,
    role: worker.role,
    language: worker.language,
    jobTitle: worker.jobTitle,
    site,
  };
}
