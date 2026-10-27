import { Icon, type IconName } from './Icon';
import { SpeakButton } from './SpeakButton';

interface TileProps {
  href: string;
  icon: IconName;
  label: string;
}

/** Action card: tinted icon, label and chevron. The read-aloud button is a sibling, not nested in the link. */
export function Tile({ href, icon, label }: TileProps) {
  return (
    <div class="tile">
      <a class="tile-link" href={href}>
        <span class="tile-icon">
          <Icon name={icon} size={24} />
        </span>
        <span class="tile-foot">
          <span class="tile-label">{label}</span>
          <span class="tile-chevron">
            <Icon name="chevron" size={20} />
          </span>
        </span>
      </a>
      <div class="tile-speak">
        <SpeakButton text={label} />
      </div>
    </div>
  );
}
