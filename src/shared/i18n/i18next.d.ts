import 'i18next';

import type { fr } from './locales/fr';

// Rend les clés de traduction typées : une faute de frappe dans t('...') est
// détectée avant même de lancer l'application.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof fr };
    returnNull: false;
  }
}
