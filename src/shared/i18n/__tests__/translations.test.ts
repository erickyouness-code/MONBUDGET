import { defaultCurrencyForRegion } from '../../config/countries';
import { resolveLanguage } from '../languages';
import { ar } from '../locales/ar';
import { en } from '../locales/en';
import { fr } from '../locales/fr';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

function values(obj: object): string[] {
  return Object.values(obj).flatMap((v) => (typeof v === 'object' && v !== null ? values(v) : [v as string]));
}

describe('traductions', () => {
  it.each([
    ['ar', ar],
    ['en', en],
  ])('%s contient exactement les mêmes clés que le français', (_, locale) => {
    expect(keys(locale).sort()).toEqual(keys(fr).sort());
  });

  it.each([
    ['fr', fr],
    ['ar', ar],
    ['en', en],
  ])("%s n'a aucun texte vide", (_, locale) => {
    expect(values(locale).every((v) => v.trim().length > 0)).toBe(true);
  });

  it('garde les mêmes variables {{...}} dans toutes les langues', () => {
    const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
    expect(vars(ar.settings.version)).toBe(vars(fr.settings.version));
    expect(vars(en.settings.version)).toBe(vars(fr.settings.version));
  });
});

describe('resolveLanguage', () => {
  it('respecte le choix explicite', () => {
    expect(resolveLanguage('ar', 'en')).toBe('ar');
  });
  it('suit le téléphone si la langue est prise en charge', () => {
    expect(resolveLanguage(null, 'en')).toBe('en');
    expect(resolveLanguage(null, 'ar')).toBe('ar');
  });
  it('revient au français sinon', () => {
    expect(resolveLanguage(null, 'es')).toBe('fr');
    expect(resolveLanguage(null, null)).toBe('fr');
  });
});

describe('defaultCurrencyForRegion', () => {
  it('propose le FCFA en zone CEMAC et le dirham ailleurs', () => {
    expect(defaultCurrencyForRegion('GA')).toBe('XAF');
    expect(defaultCurrencyForRegion('cm')).toBe('XAF');
    expect(defaultCurrencyForRegion('MA')).toBe('MAD');
    expect(defaultCurrencyForRegion(null)).toBe('MAD');
  });
});
