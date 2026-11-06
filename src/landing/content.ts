export type Lang = 'fr' | 'en';

export const STATUS_URL = 'https://status.grelines.fr';

export interface SiteCopy {
  footer: {
    columns: { title: string; links: { label: string; href: string }[] }[];
    status: string;
    theme: string;
    themeAuto: string;
    themeLight: string;
    themeDark: string;
  };
  footerLegal: string;
}

const FR: SiteCopy = {
  footer: {
    columns: [
      {
        title: 'Application',
        links: [
          { label: 'Ouvrir GreLines', href: '/app' },
          { label: 'Afficher un écran', href: '/app/screen' },
          { label: "L'installer sur son téléphone", href: '/fr/docs/start/installer' },
          { label: "Ce que fait l'application", href: '/fr/docs/usage/arrets' },
        ],
      },
      {
        title: 'Réseaux',
        links: [
          { label: 'Raccorder vos données', href: '/fr/docs/reseaux/prerequis' },
          { label: 'Déployer GreLines', href: '/fr/docs/deploy/avant-de-commencer' },
          { label: "L'infrastructure", href: '/fr/docs/infra/vue-densemble' },
        ],
      },
      {
        title: 'Données',
        links: [
          { label: 'GreLines Data', href: 'https://data.grelines.fr' },
          { label: 'Consulter mes données', href: 'https://data.grelines.fr/mes-donnees' },
          { label: 'Demander la suppression', href: 'https://data.grelines.fr/suppression' },
        ],
      },
      {
        title: 'Ressources',
        links: [
          { label: 'Documentation', href: '/fr/docs' },
          { label: 'Newsroom', href: '/fr/newsroom' },
          { label: 'État du service', href: STATUS_URL },
          { label: 'Code source', href: 'https://github.com/antquu/GreLines' },
        ],
      },
      {
        title: 'Langue',
        links: [
          { label: 'Français', href: '/fr/docs' },
          { label: 'English', href: '/en/docs' },
        ],
      },
      {
        title: 'Légal et confiance',
        links: [
          { label: 'Politique de confidentialité', href: '/fr/legals/privacy-policy' },
          { label: 'RGPD', href: '/fr/legals/gdpr' },
          { label: "Conditions d'utilisation", href: '/fr/legals/terms-of-service' },
          { label: 'Conditions de vente', href: '/fr/legals/terms-of-sale' },
          { label: 'Licence du code source', href: '/fr/legals/license' },
          { label: 'Vos données', href: 'https://data.grelines.fr' },
        ],
      },
      {
        title: 'Social',
        links: [{ label: 'GitHub', href: 'https://github.com/antquu/GreLines' }],
      },
    ],
    status: 'Tous les services fonctionnent',
    theme: 'Thème',
    themeAuto: 'Suivre le système',
    themeLight: 'Thème clair',
    themeDark: 'Thème sombre',
  },
  footerLegal: 'Tous droits réservés',
};

const EN: SiteCopy = {
  footer: {
    columns: [
      {
        title: 'App',
        links: [
          { label: 'Open GreLines', href: '/app' },
          { label: 'Show a screen', href: '/app/screen' },
          { label: 'Install it on a phone', href: '/en/docs/start/installer' },
          { label: 'What the app does', href: '/en/docs/usage/arrets' },
        ],
      },
      {
        title: 'Networks',
        links: [
          { label: 'Connecting your data', href: '/en/docs/reseaux/prerequis' },
          { label: 'Deploying GreLines', href: '/en/docs/deploy/avant-de-commencer' },
          { label: 'The infrastructure', href: '/en/docs/infra/vue-densemble' },
        ],
      },
      {
        title: 'Data',
        links: [
          { label: 'GreLines Data', href: 'https://data.grelines.fr' },
          { label: 'See my data', href: 'https://data.grelines.fr/mes-donnees' },
          { label: 'Request deletion', href: 'https://data.grelines.fr/suppression' },
        ],
      },
      {
        title: 'Resources',
        links: [
          { label: 'Documentation', href: '/en/docs' },
          { label: 'Newsroom', href: '/en/newsroom' },
          { label: 'Service status', href: STATUS_URL },
          { label: 'Source code', href: 'https://github.com/antquu/GreLines' },
        ],
      },
      {
        title: 'Language',
        links: [
          { label: 'Français', href: '/fr/docs' },
          { label: 'English', href: '/en/docs' },
        ],
      },
      {
        title: 'Legal & Trust',
        links: [
          { label: 'Privacy policy', href: '/en/legals/privacy-policy' },
          { label: 'GDPR', href: '/en/legals/gdpr' },
          { label: 'Terms of service', href: '/en/legals/terms-of-service' },
          { label: 'Terms of sale', href: '/en/legals/terms-of-sale' },
          { label: 'Source code licence', href: '/en/legals/license' },
          { label: 'Your data', href: 'https://data.grelines.fr' },
        ],
      },
      {
        title: 'Social',
        links: [{ label: 'GitHub', href: 'https://github.com/antquu/GreLines' }],
      },
    ],
    status: 'All systems normal',
    theme: 'Theme',
    themeAuto: 'Follow the system',
    themeLight: 'Light theme',
    themeDark: 'Dark theme',
  },
  footerLegal: 'All rights reserved',
};

export const COPY: Record<Lang, SiteCopy> = { fr: FR, en: EN };
