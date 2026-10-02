import { LineBadge } from './LineBadge';

const MAX_VISIBLE = 3;

export function LineCloud({
  lines,
  size = 'sm',
  disruptedLines,
}: {
  lines: string[];
  size?: 'xs' | 'sm' | 'md';
  disruptedLines?: Set<string>;
}) {
  const visible = lines.slice(0, MAX_VISIBLE);
  const extra = lines.length - visible.length;

  const step = size === 'xs' ? 10 : size === 'md' ? 18 : 14;
  const badgeSize = size === 'md' ? 'sm' : 'xs';

  if (visible.length === 0) return null;

  return (
    <span
      className="relative inline-flex flex-shrink-0 items-center"
      style={{
        width: (visible.length - 1) * step + (size === 'md' ? 36 : 24) + (extra > 0 ? step + 8 : 0),
        height: (visible.length - 1) * (step / 2) + (size === 'md' ? 36 : 24),
      }}
      aria-hidden
    >
      {visible.map((line, index) => {
        const code = line.replace(/^SEM[:_]/, '').toUpperCase();
        return (
          <span
            key={`${line}-${index}`}
            className="absolute"
            style={{
              left: index * step,
              top: index * (step / 2),
              zIndex: index + 1,
            }}
          >
            <LineBadge
              line={{ id: line, shortName: code, hasTraffic: disruptedLines?.has(code) }}
              size={badgeSize}
            />
          </span>
        );
      })}

      {extra > 0 && (
        <span
          className="absolute flex items-center justify-center rounded-full bg-slate-700 px-1.5 text-[0.625rem] font-bold text-white"
          style={{
            left: visible.length * step,
            top: visible.length * (step / 2),
            height: size === 'md' ? 24 : 18,
            zIndex: visible.length + 1,
          }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
