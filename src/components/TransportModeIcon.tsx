import { MdTram, MdDirectionsBus } from 'react-icons/md';
import { TbTrainFilled } from 'react-icons/tb';
import { IoMdTrain } from 'react-icons/io';
import { normalizeMode, type TransportMode } from '../utils/transportMode';

export function TransportModeIcon({
  mode,
  className = 'w-3.5 h-3.5',
}: {
  mode: TransportMode | string | undefined | null;
  className?: string;
}) {
  switch (normalizeMode(mode)) {
    case 'METRO':
      return <IoMdTrain className={className} />;
    case 'RAIL':
      return <TbTrainFilled className={className} />;
    case 'TRAM':
      return <MdTram className={className} />;
    default:
      return <MdDirectionsBus className={className} />;
  }
}
