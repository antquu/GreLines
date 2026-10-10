import { LineBadge } from '../components/LineBadge';

// same badge as the app, only scaled up to be read from afar
export function ScreenLineBadge({
  lineId,
  label,
  color,
  textColor,
  size = 'md',
}: {
  lineId: string;
  label: string;
  color?: string;
  textColor?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span className="inline-flex flex-shrink-0" style={{ zoom: size === 'sm' ? 1 : 1.5 }}>
      <LineBadge line={{ id: lineId, routeId: lineId, shortName: label, color, textColor }} size={size === 'sm' ? 'sm' : 'lg'} />
    </span>
  );
}
