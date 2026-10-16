export interface NavPalette {
  isLight: boolean;
  ink: string;
  muted: string;
  soft: string;
  card: string;
  surface: string;
  cardBorder: string;
  cardShadow: string;
  box: string;
  rule: string;
}

export function navPalette(isLight: boolean): NavPalette {
  return isLight
    ? {
        isLight,
        ink: '#000000',
        muted: '#525252',
        soft: '#525252',
        card: '#ffffff',
        surface: '#ffffff',
        cardBorder: '#e2e8f0',
        cardShadow: '0 12px 30px rgba(148,163,184,0.16)',
        box: '#f1f5f9',
        rule: '#e2e8f0',
      }
    : {
        isLight,
        ink: '#ffffff',
        muted: '#a3a3a3',
        soft: '#a3a3a3',
        card: 'rgba(255,255,255,0.05)',
        surface: 'rgb(var(--gl-sheet-rgb))',
        cardBorder: 'rgba(255,255,255,0.1)',
        cardShadow: 'none',
        box: 'rgba(255,255,255,0.08)',
        rule: 'rgba(255,255,255,0.08)',
      };
}

export const COLLAPSED_SHEET_PX = 176;

export const FOLLOW_PANEL_WIDTH = 400;

export const GUIDANCE_SNAP = { collapsed: 1, middle: 2, full: 3 } as const;
