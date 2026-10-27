import { Icon, type IconName } from './Icon';
import { SpeakButton } from './SpeakButton';

interface TileProps {
  href: string;
  icon: IconName;
  label: string;
}

/** Big icon tile for worker home. The link and the read-aloud button are siblings, not nested. */
export function Tile({ href, icon, label }: TileProps) {
  return (
    <div class="tile">
      <a class="tile-link" href={href}>
        <Icon name={icon} size={40} />
        <span>{label}</span>
      </a>
      <div class="tile-foot">
        <SpeakButton text={label} />
      </div>
    </div>
  );
}
