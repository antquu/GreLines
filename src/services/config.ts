
/**
 * Boutique de titres M réso.
 *
 * Le site du fournisseur, pas une page à nous : l'achat, le compte et le
 * paiement restent chez lui.
 */
export const PASS_SHOP_URL = 'https://pass.mobilites-m.fr/mypass/services/public-transport';

export interface Credit {
  role: string;
  name: string | null;
  link: string | null;
}

export interface AdminIdentifier {
  user: string;
  password: string;
}

export interface GreLinesConfig {
  version: string;
  credits: Credit[];
  admin: {
    identifiers: AdminIdentifier[];
  };
}

export function loadConfig(): GreLinesConfig {
  try {
    
    const version = import.meta.env.VITE_APP_VERSION || '3.7.0';

    const creditsJson = import.meta.env.VITE_CREDITS;
    const credits: Credit[] = creditsJson ? JSON.parse(creditsJson) : [];

    const adminIdentifiersJson = import.meta.env.VITE_ADMIN_IDENTIFIERS;
    const identifiers: AdminIdentifier[] = adminIdentifiersJson ? JSON.parse(adminIdentifiersJson) : [];

    return {
      version,
      credits,
      admin: {
        identifiers
      }
    };
  } catch (error) {    
    return {
      version: '3.7.0',
      credits: [],
      admin: {
        identifiers: []
      }
    };
  }
}

export const config = loadConfig();
