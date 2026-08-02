const BUS_FALLBACK_LINES = new Set([
  '38','39','41','42','44','45','46','47','48','49','50','51','52','53','54','55','56','57','58','59','60','61','63','64','65','66','67','68','69','70','71','72','73','74','75','76','77','78','79','81','83','100','201','202','203','300','301','400','401','500','501','502','503','504','600',
]);
const CHRONO_FALLBACK_A = new Set(['C1','C2','C3','C4','C5','C6','C7','C8']);
const CHRONO_FALLBACK_B = new Set(['C9','C10','C11','C12','C13','C14']);
export const LINE_COLORS = {
  C11: "#EF7C00",
  D: "#FD8C06",
  C1: "#F5D24D",
  C2: "#F5D24D",
  C3: "#F5D24D",
  C4: "#F5D24D",
  C5: "#F5D24D",
  C6: "#F5D24D",
  C7: "#F5D24D",
  C8: "#F5D24D",
  C9: "#F5D24D",
  C10: "#EF7C00",
  C12: "#EF7C00",
  C13: "#EF7C00",
  C14: "#EF7C00",
};
const DEFAULT_LINE_BADGE_COLOR = '#3b82f6';
const GRAY_FALLBACK_COLOR = '#94A3B8';

/**
 * Surcharges de lignes définies dans le CRM GreStudio, indexées par code
 * normalisé ("A", "C1", "16").
 *
 * Elles sont consultées ici, au coeur du résolveur de couleurs, plutôt qu'au
 * seul endroit où le catalogue est chargé : les couleurs de ligne proviennent
 * de sources multiples (catalogue, arrêts, départs, itinéraires) et doivent
 * toutes respecter la surcharge.
 */
type LineColorOverride = { color?: string | null; textColor?: string | null };
const lineColorOverrides = new Map<string, LineColorOverride>();

export function setLineColorOverrides(entries: Array<{ lineId: string } & LineColorOverride>): void {
  lineColorOverrides.clear();
  for (const entry of entries) {
    const code = normalizeLineId(entry.lineId);
    if (!code) continue;
    lineColorOverrides.set(code, { color: entry.color, textColor: entry.textColor });
  }
}

function getLineColorOverride(lineId?: string | null): LineColorOverride | null {
  const code = normalizeLineId(lineId);
  if (!code) return null;
  return lineColorOverrides.get(code) ?? null;
}

export const normalizeLineId = (value?: string | null): string | null => {
  if (!value) return null;
  const code = String(value)
    .trim()
    .toUpperCase()
    .replace(/^(?:SEM|SE2):?/, '')
    .replace(/^(?:SEM|SE2)_/, '');
  return code || null;
};

export const normalizeHexColor = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const hex = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex;
  return undefined;
};

export const isGrayFallbackColor = (color?: string | null): boolean => {
  const normalized = normalizeHexColor(color);
  return normalized?.toLowerCase() === GRAY_FALLBACK_COLOR.toLowerCase();
};

export const isFallbackColor = (color?: string | null): boolean => {
  const normalized = normalizeHexColor(color);
  if (!normalized) return true;
  const norm = normalized.toLowerCase();
  if (isGrayFallbackColor(normalized)) return true;
  if (norm === DEFAULT_LINE_BADGE_COLOR.toLowerCase()) return true;
  return false;
};

export const getSpecialLineFallback = (lineId?: string | null) => {
  const code = normalizeLineId(lineId);
  if (!code) return null;
  // Prefer explicit mapping from LINE_COLORS when available
  if (LINE_COLORS[code as keyof typeof LINE_COLORS]) {
    return { backgroundColor: LINE_COLORS[code as keyof typeof LINE_COLORS] };
  }
  if (BUS_FALLBACK_LINES.has(code)) return { backgroundColor: '#E16597' };
  if (CHRONO_FALLBACK_A.has(code)) return { backgroundColor: '#F5D753', textColor: '#000000' };
  if (CHRONO_FALLBACK_B.has(code)) return { backgroundColor: '#F57B0C', textColor: '#FFFFFF' };
  return null;
};

export const resolveLineBackgroundColor = (
  rawColor?: string | null,
  lineId?: string | null,
  defaultColor = DEFAULT_LINE_BADGE_COLOR,
): string => {
  // Une surcharge définie dans le CRM prime sur tout le reste, y compris sur
  // la table de couleurs officielles ci-dessous.
  const overrideColor = normalizeHexColor(getLineColorOverride(lineId)?.color);
  if (overrideColor) return overrideColor;

  // Prefer explicit mapping from LINE_COLORS first (matches Grego behaviour)
  const code = normalizeLineId(lineId);
  if (code && LINE_COLORS[code as keyof typeof LINE_COLORS]) {
    return LINE_COLORS[code as keyof typeof LINE_COLORS];
  }
  const normalized = normalizeHexColor(rawColor);
  const special = getSpecialLineFallback(lineId);
  if (isFallbackColor(rawColor) && special) return special.backgroundColor;
  if (normalized) return normalized;
  if (special) return special.backgroundColor;
  return defaultColor;
};

export const resolveLineTextColor = (
  rawColor?: string | null,
  lineId?: string | null,
  explicitTextColor?: string | null,
): string => {
  const override = getLineColorOverride(lineId);
  const overrideTextColor = normalizeHexColor(override?.textColor);
  if (overrideTextColor) return overrideTextColor;
  // Couleur de fond surchargée sans couleur de texte : on calcule le contraste
  // plutôt que d'appliquer les règles de la palette officielle.
  const overrideBackground = normalizeHexColor(override?.color);
  if (overrideBackground) {
    const r = parseInt(overrideBackground.slice(1, 3), 16);
    const g = parseInt(overrideBackground.slice(3, 5), 16);
    const b = parseInt(overrideBackground.slice(5, 7), 16);
    return r * 0.299 + g * 0.587 + b * 0.114 > 186 ? '#000000' : '#FFFFFF';
  }

  // Chrono C1..C9 are yellow in the MTAG palette, so force black text even if
  // an upstream object forgot or overrode the official text color.
  const code = normalizeLineId(lineId);
  if (code && /^C[1-9]$/.test(code)) return '#000000';
  const normalizedTextColor = normalizeHexColor(explicitTextColor);
  if (normalizedTextColor) return normalizedTextColor;
  const special = getSpecialLineFallback(lineId);
  if (isFallbackColor(rawColor) && special?.textColor) return special.textColor;
  if (special?.textColor && !normalizeHexColor(rawColor)) return special.textColor;
  const background = resolveLineBackgroundColor(rawColor, lineId);
  const r = parseInt(background.slice(1, 3), 16);
  const g = parseInt(background.slice(3, 5), 16);
  const b = parseInt(background.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 186 ? '#000000' : '#FFFFFF';
};

export const resolveLineStyle = (
  lineId?: string | null,
  rawColor?: string | null,
  explicitTextColor?: string | null,
) => {
  return {
    backgroundColor: resolveLineBackgroundColor(rawColor, lineId),
    color: resolveLineTextColor(rawColor, lineId, explicitTextColor),
  };
};
