import { isSncfLine, SNCF_TER_COLOR } from '../utils/lineColors';









export function DepartureLineBadge({
  routeRef,
  label,
  style,
  round,
  sizeClass,
}: {
  
  routeRef: string;
  label: string;
  
  style: { backgroundColor?: string; color?: string };
  
  round: boolean;
  
  sizeClass: string;
}) {
  if (isSncfLine(routeRef)) {
    return (
      <div
        
        
        
        className={`flex flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl ${sizeClass}`}
        style={{ backgroundColor: SNCF_TER_COLOR, color: '#ffffff' }}
      >
        <img src="/assets/ter.png" alt="TER" className="h-2.5 w-auto object-contain" />
        <span className="text-[10px] font-extrabold leading-none">{label}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center font-bold ${round ? 'rounded-full' : 'rounded-2xl'} ${sizeClass}`}
      style={style}
    >
      {label}
    </div>
  );
}
