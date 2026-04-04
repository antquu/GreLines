// Configuration loader for GreLines app
// Loads configuration from environment variables

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
    // Load from environment variables (Vite prefixes with VITE_)
    const version = import.meta.env.VITE_APP_VERSION || '2.0.1';

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
    console.error('Error loading configuration:', error);
    // Return default config if parsing fails
    return {
      version: '2.0.1',
      credits: [],
      admin: {
        identifiers: []
      }
    };
  }
}

// Export the loaded configuration
export const config = loadConfig();