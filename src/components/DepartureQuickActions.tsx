import type { ComponentType, SVGProps } from 'react';

export interface QuickAction {
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  onSelect?: () => void;
  background?: string;
  color?: string;
}

export function DepartureQuickActions({
  style,
  actions,
}: {
  style: { backgroundColor?: string; color?: string };
  actions: QuickAction[];
}) {
  const background = style.backgroundColor || '#1d4ed8';
  const ink = style.color || '#ffffff';

  return (
    <div
      className="grid gap-2 border-t border-slate-700/70 pt-4"
      style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}
    >
      {actions.map(({ label, Icon, onSelect, background: tone, color: toneInk }) => (
        <button
          key={label}
          type="button"
          onClick={onSelect}
          className="flex min-h-[74px] min-w-0 flex-col justify-between rounded-xl p-2.5 text-left transition active:scale-[0.97]"
          style={{ backgroundColor: tone ?? background, color: toneInk ?? ink }}
        >
          <span className="text-[0.8125rem] font-bold leading-tight">{label}</span>
          <Icon className="ml-auto h-5 w-5 flex-shrink-0 opacity-90" />
        </button>
      ))}
    </div>
  );
}
