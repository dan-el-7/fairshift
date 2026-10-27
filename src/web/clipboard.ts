/** Copies text. Falls back to a hidden textarea where the async clipboard API is unavailable. Resolves false on failure. */
export async function copyText(text: string): Promise<boolean> {
  try {
    // Typed as always present, but older browsers leave it undefined.
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (typeof clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea method.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    // execCommand has no replacement for copying from a hidden textarea. This runs only when the async API failed.
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- last-resort fallback where the async clipboard API is missing or refused
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
