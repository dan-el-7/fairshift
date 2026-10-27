import type { ComponentChildren } from 'preact';

export type BannerTone = 'info' | 'success' | 'warn' | 'danger';

/** A full-width message. Danger banners are announced as alerts; the others as status updates. */
export function Banner({ tone, title, children }: { tone: BannerTone; title?: string; children?: ComponentChildren }) {
  return (
    <div class={`banner banner-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {title ? <strong class="banner-title">{title}</strong> : null}
      {children}
    </div>
  );
}
