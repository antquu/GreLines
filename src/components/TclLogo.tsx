import { TCL_UNIT as UNIT, tclTabWidth, tclLogo, tclLogoEntry, tclTabCode } from '../utils/tclLogos';
import { badgeImage, tclTabImageUrl } from '../utils/badgeImages';

export function TclModeCorner({ id, height }: { id: string; height: number }) {
  const mode = tclLogo(id)?.mode;
  const code = mode ? tclTabCode(mode) : null;
  const entry = code ? tclLogoEntry(code) : null;
  if (!mode || !code || !entry) return null;
  const tabWidth = tclTabWidth(mode);
  return (
    <svg
      viewBox={`0 0 ${tabWidth} ${UNIT}`}
      height={height}
      width={(tabWidth / UNIT) * height}
      className="pointer-events-none absolute -left-1.5 -top-1.5 drop-shadow-[0_0_1.5px_rgba(0,0,0,0.7)]"
      aria-label={mode}
      role="img"
    >
      <image href={badgeImage(tclTabImageUrl(code))} width={entry.w} height={UNIT} />
    </svg>
  );
}
