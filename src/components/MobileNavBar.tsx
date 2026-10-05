import type { ComponentType, SVGProps } from 'react';
import { tx } from '../i18n';
import { appLanguage } from '../utils/appLanguage';

export interface MobileNavItem {
  key: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  onSelect: () => void;
  disabled?: boolean;
}

export const NAV_ITEM_WIDTH = 72;

export function MobileNavBar({
  items,
  activeKey,
  isLight = false,
  compact = false,
}: {
  items: MobileNavItem[];
  activeKey?: string;
  isLight?: boolean;
  compact?: boolean;
}) {
  return (
    <nav
      aria-label={tx(appLanguage() === 'fr').common.mainNavigation}
      className={`flex items-stretch px-2 transition-[gap,padding] duration-300 ease-in-out ${
        compact ? 'gap-0 py-0' : 'gap-1 py-1'
      }`}
    >
      {items.map(item => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            onClick={item.disabled ? undefined : item.onSelect}
            aria-current={active ? 'page' : undefined}
            aria-disabled={item.disabled || undefined}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0 rounded-2xl py-1 text-[0.625rem] font-medium transition-colors duration-[800ms] ease-[cubic-bezier(0.45,0,0.55,1)] ${
              item.disabled
                ? 'opacity-40'
                : active
                ? isLight ? 'text-slate-900' : 'text-white'
                : isLight
                ? 'text-slate-500'
                : 'text-slate-400'
            }`}
          >
            <span
              className={`relative z-10 flex items-center justify-center transition-[transform,opacity,width,height] duration-[700ms] ease-[cubic-bezier(0.45,0,0.55,1)] ${
                compact ? 'size-12' : 'size-10'
              } ${active ? 'scale-110 opacity-100' : 'scale-90 opacity-70'}`}
            >
              <item.Icon className="size-7" strokeWidth={1.9} />
            </span>
            <span
              className={`grid overflow-hidden leading-4 transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                compact ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
              }`}
            >
              <span className="min-h-0 truncate px-0.5">{item.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
