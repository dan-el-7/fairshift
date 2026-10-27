import type { ComponentChildren } from 'preact';
import { Icon, type IconName } from './Icon';

export type BannerTone = 'info' | 'success' | 'warn' | 'danger';

const ICON: Record<BannerTone, IconName> = { info: 'help', success: 'check', warn: 'alert', danger: 'alert' };

/** A full-width message. Danger banners are announced as alerts; the others as status updates. */
export function Banner({ tone, title, titleId, children }: { tone: BannerTone; title?: string; titleId?: string; children?: ComponentChildren }) {
  return (
    <div class={`banner banner-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span class="banner-icon">
        <Icon name={ICON[tone]} size={20} />
      </span>
      <div class="banner-body">
        {title ? (
          <strong id={titleId} class="banner-title">
            {title}
          </strong>
        ) : null}
        {children}
      </div>
    </div>
  );
}
