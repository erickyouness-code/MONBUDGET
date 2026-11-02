import type { CurrencyCode } from './currencies';

/**
 * Pays pris en charge au lancement. Pour ajouter un pays, il suffit d'ajouter
 * une entrée ici (et sa devise dans currencies.ts si elle est nouvelle).
 */
export type CountryCode = 'MA' | 'GA';

export type CountryConfig = {
  code: CountryCode;
  currency: CurrencyCode;
  flag: string;
};

export const COUNTRIES: Record<CountryCode, CountryConfig> = {
  MA: { code: 'MA', currency: 'MAD', flag: '🇲🇦' },
  GA: { code: 'GA', currency: 'XAF', flag: '🇬🇦' },
};

/** Pays de la zone CEMAC qui utilisent aussi le franc CFA d'Afrique centrale. */
const XAF_REGIONS = new Set(['GA', 'CM', 'CG', 'TD', 'CF', 'GQ']);

/** Devise proposée par défaut à partir de la région du téléphone. */
export function defaultCurrencyForRegion(region: string | null | undefined): CurrencyCode {
  return region && XAF_REGIONS.has(region.toUpperCase()) ? 'XAF' : 'MAD';
}
