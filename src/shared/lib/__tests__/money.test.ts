import { formatMoney, parseAmountToMinor } from '../money';

const NNBSP = ' ';
const NBSP = ' ';
const strip = (s: string) => s.replace(/[⁦⁩]/g, '');

describe('formatMoney', () => {
  it('formate le dirham en français avec 2 décimales', () => {
    expect(formatMoney(125050, 'MAD', 'fr')).toBe(`1${NNBSP}250,50${NBSP}DH`);
  });

  it('formate le franc CFA sans décimales', () => {
    expect(formatMoney(12500, 'XAF', 'fr')).toBe(`12${NNBSP}500${NBSP}FCFA`);
  });

  it('formate en anglais avec virgule de milliers et point décimal', () => {
    expect(formatMoney(123456789, 'MAD', 'en')).toBe(`1,234,567.89${NBSP}DH`);
  });

  it("utilise le symbole arabe et isole le nombre pour l'affichage RTL", () => {
    const result = formatMoney(125050, 'MAD', 'ar');
    expect(result.startsWith('⁦')).toBe(true);
    expect(strip(result)).toBe(`1${NNBSP}250,50${NBSP}د.م.`);
  });

  it('gère zéro et les petits montants', () => {
    expect(formatMoney(0, 'MAD', 'fr')).toBe(`0,00${NBSP}DH`);
    expect(formatMoney(5, 'MAD', 'fr')).toBe(`0,05${NBSP}DH`);
    expect(formatMoney(0, 'XAF', 'fr')).toBe(`0${NBSP}FCFA`);
  });

  it('affiche les signes selon signDisplay', () => {
    expect(formatMoney(-34575, 'MAD', 'fr')).toBe(`−345,75${NBSP}DH`);
    expect(formatMoney(1000, 'XAF', 'fr', { signDisplay: 'always' })).toBe(`+1${NNBSP}000${NBSP}FCFA`);
    expect(formatMoney(-1000, 'XAF', 'fr', { signDisplay: 'never' })).toBe(`1${NNBSP}000${NBSP}FCFA`);
    expect(formatMoney(0, 'XAF', 'fr', { signDisplay: 'always' })).toBe(`0${NBSP}FCFA`);
  });

  it('peut masquer le symbole', () => {
    expect(formatMoney(100, 'MAD', 'en', { hideSymbol: true })).toBe('1.00');
  });

  it('refuse les montants non entiers', () => {
    expect(() => formatMoney(10.5, 'MAD', 'fr')).toThrow(RangeError);
  });
});

describe('parseAmountToMinor', () => {
  it('convertit les saisies courantes', () => {
    expect(parseAmountToMinor('1250,5', 'MAD')).toBe(125050);
    expect(parseAmountToMinor('1 250.50', 'MAD')).toBe(125050);
    expect(parseAmountToMinor('300', 'MAD')).toBe(30000);
    expect(parseAmountToMinor('12 500', 'XAF')).toBe(12500);
    expect(parseAmountToMinor('0,1', 'MAD')).toBe(10);
  });

  it('évite les erreurs de virgule flottante', () => {
    expect(parseAmountToMinor('0.29', 'MAD')).toBe(29);
    expect(parseAmountToMinor('19.99', 'MAD')).toBe(1999);
  });

  it('refuse les saisies invalides', () => {
    expect(parseAmountToMinor('', 'MAD')).toBeNull();
    expect(parseAmountToMinor('abc', 'MAD')).toBeNull();
    expect(parseAmountToMinor('-50', 'MAD')).toBeNull();
    expect(parseAmountToMinor('1,234', 'MAD')).toBeNull(); // 3 décimales
    expect(parseAmountToMinor('10,5', 'XAF')).toBeNull(); // pas de décimales en FCFA
    expect(parseAmountToMinor('1.2.3', 'MAD')).toBeNull();
    expect(parseAmountToMinor('99999999999999999999', 'MAD')).toBeNull();
  });
});

describe('formatMoneyCompact', () => {
  const { formatMoneyCompact, formatPlainNumber, toMajorRounded } = jest.requireActual('../money');
  it('masque uniquement les décimales nulles', () => {
    expect(formatMoneyCompact(925000, 'MAD', 'fr')).toBe(`9${NNBSP}250${NBSP}DH`);
    expect(formatMoneyCompact(34575, 'MAD', 'fr')).toBe(`345,75${NBSP}DH`);
    expect(formatMoneyCompact(12500, 'XAF', 'en')).toBe(`12,500${NBSP}FCFA`);
    expect(formatMoneyCompact(-120000, 'MAD', 'en')).toBe(`−1,200${NBSP}DH`);
  });
  it('formate les nombres des axes', () => {
    expect(formatPlainNumber(12000, 'fr')).toBe(`12${NNBSP}000`);
    expect(toMajorRounded(125050, 'MAD')).toBe(1251);
  });
});
