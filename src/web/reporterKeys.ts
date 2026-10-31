const PREFIX = 'fairshift:reporter-key:';

export function storeReporterKey(code: string, key: string): void {
  try { localStorage.setItem(`${PREFIX}${code}`, key); } catch { /* private browsing may disable storage */ }
}

export function getReporterKey(code: string): string {
  try { return localStorage.getItem(`${PREFIX}${code}`) ?? ''; } catch { return ''; }
}
