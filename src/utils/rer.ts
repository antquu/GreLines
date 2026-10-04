const RER_COLORS: Record<string, { backgroundColor: string; color: string }> = {
  A: { backgroundColor: '#E3051C', color: '#FFFFFF' },
  B: { backgroundColor: '#5291CE', color: '#FFFFFF' },
  C: { backgroundColor: '#FFCE00', color: '#25303B' },
  D: { backgroundColor: '#00814F', color: '#FFFFFF' },
  E: { backgroundColor: '#C04191', color: '#FFFFFF' },
};

const NOCTILIEN_STYLE = { backgroundColor: '#0A0082', color: '#FFFFFF' };

export interface IdfBadge {
  letter: string;
  logo: string;
  logoAlt: string;
  style: { backgroundColor: string; color: string };
}

export function rerLine(ref: string | null | undefined): IdfBadge | null {
  const id = String(ref ?? '').trim();
  const rer = /^SNC[:_]([A-E])\.rer$/i.exec(id);
  if (rer) {
    const letter = rer[1].toUpperCase();
    return { letter, logo: '/assets/rer.svg', logoAlt: 'RER', style: RER_COLORS[letter] };
  }
  const noctilien = /^SNC[:_](N\d{1,3})\.[a-z]*noctilien[a-z]*$/i.exec(id);
  if (noctilien) {
    return { letter: noctilien[1].toUpperCase(), logo: '/assets/noctilien.svg', logoAlt: 'Noctilien', style: NOCTILIEN_STYLE };
  }
  return null;
}
