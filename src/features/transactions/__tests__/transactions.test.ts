import { sanitizeAmountInput } from '@/shared/lib/money';

import { addDays, defaultPaymentMethod, groupByDay, monthRange, netEffect, searchPattern, summarize, toISODate } from '../logic';
import { makeAccountSchema, makeTransactionSchema, toTransactionWrite } from '../schema';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'fr' }] }));

const tx = (type: 'expense' | 'income' | 'transfer', amount_minor: number, occurred_on = '2026-11-02') => ({ type, amount_minor, occurred_on });

describe('totaux', () => {
  it('ne compte jamais un transfert comme revenu ou dépense', () => {
    expect(netEffect(tx('transfer', 50000))).toBe(0);
    const s = summarize([tx('income', 800000), tx('expense', 12550), tx('transfer', 30000), tx('expense', 1500)]);
    expect(s).toEqual({ incomeMinor: 800000, expensesMinor: 14050, netMinor: 785950 });
  });

  it('regroupe par jour avec le net de chaque journée', () => {
    const sections = groupByDay([
      tx('expense', 1000, '2026-11-02'),
      tx('income', 5000, '2026-11-02'),
      tx('transfer', 9999, '2026-11-01'),
      tx('expense', 300, '2026-10-30'),
    ]);
    expect(sections.map((s) => [s.date, s.data.length, s.netMinor])).toEqual([
      ['2026-11-02', 2, 4000],
      ['2026-11-01', 1, 0],
      ['2026-10-30', 1, -300],
    ]);
  });
});

describe('dates', () => {
  it('donne la date locale sans décalage horaire', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('ajoute des jours en changeant de mois et d’année', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('calcule le premier et le dernier jour du mois', () => {
    expect(monthRange(new Date(2028, 1, 10))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('moyen de paiement proposé', () => {
  it('dépend du type de compte', () => {
    expect(defaultPaymentMethod('cash')).toBe('cash');
    expect(defaultPaymentMethod('mobile_money')).toBe('mobile_money');
    expect(defaultPaymentMethod('bank')).toBe('card');
    expect(defaultPaymentMethod('other')).toBeNull();
  });
});

describe('recherche', () => {
  it('neutralise les caractères spéciaux', () => {
    expect(searchPattern('  ')).toBeNull();
    expect(searchPattern('café')).toBe('"%café%"');
    expect(searchPattern('50%_off')).toBe('"%50\\%\\_off%"');
    expect(searchPattern('a"b')).toBe('"%a\\"b%"');
  });
});

describe('saisie du montant', () => {
  it('garde au plus 2 décimales pour le dirham', () => {
    expect(sanitizeAmountInput('125.505', 'MAD')).toBe('125,50');
    expect(sanitizeAmountInput('1a2b3', 'MAD')).toBe('123');
    expect(sanitizeAmountInput('0012', 'MAD')).toBe('12');
    expect(sanitizeAmountInput('3,', 'MAD')).toBe('3,');
  });
  it('refuse les décimales pour le FCFA', () => {
    expect(sanitizeAmountInput('12500,75', 'XAF')).toBe('1250075');
    expect(sanitizeAmountInput('12 500', 'XAF')).toBe('12500');
  });
});

describe('formulaire de transaction', () => {
  const schema = makeTransactionSchema('MAD');
  const base = {
    type: 'expense' as const,
    amount: '125,50',
    accountId: 'acc-1',
    toAccountId: 'acc-2',
    categoryId: 'cat-1',
    occurredOn: '2026-11-02',
    paymentMethod: 'cash' as const,
    description: '  Courses  ',
  };
  const firstError = (v: unknown) => {
    const r = schema.safeParse(v);
    return r.success ? null : r.error.issues[0]?.message;
  };

  it('accepte une dépense valide et nettoie les champs incohérents', () => {
    const r = schema.safeParse(base);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(toTransactionWrite(r.data, 'MAD')).toEqual({
      type: 'expense',
      amount_minor: 12550,
      occurred_on: '2026-11-02',
      account_id: 'acc-1',
      to_account_id: null, // pas de compte destinataire pour une dépense
      category_id: 'cat-1',
      payment_method: 'cash',
      description: 'Courses',
    });
  });

  it('refuse un montant nul ou invalide', () => {
    expect(firstError({ ...base, amount: '0' })).toBe('transactions.errors.amountInvalid');
    expect(firstError({ ...base, amount: '' })).toBe('transactions.errors.amountInvalid');
  });

  it('exige une catégorie pour une dépense ou un revenu', () => {
    expect(firstError({ ...base, categoryId: null })).toBe('transactions.errors.categoryRequired');
  });

  it('exige deux comptes différents pour un transfert, sans catégorie', () => {
    expect(firstError({ ...base, type: 'transfer', toAccountId: null })).toBe('transactions.errors.toAccountRequired');
    expect(firstError({ ...base, type: 'transfer', toAccountId: 'acc-1' })).toBe('transactions.errors.sameAccount');
    const r = schema.safeParse({ ...base, type: 'transfer' });
    expect(r.success).toBe(true);
    if (r.success) {
      const row = toTransactionWrite(r.data, 'MAD');
      expect(row.category_id).toBeNull();
      expect(row.payment_method).toBeNull();
      expect(row.to_account_id).toBe('acc-2');
    }
  });

  it('gère le FCFA sans décimales', () => {
    const r = makeTransactionSchema('XAF').safeParse({ ...base, amount: '12500' });
    expect(r.success && toTransactionWrite(r.data, 'XAF').amount_minor).toBe(12500);
  });
});

describe('formulaire de compte', () => {
  it('exige un nom et accepte un solde vide', () => {
    const schema = makeAccountSchema('MAD');
    expect(schema.safeParse({ name: 'Espèces', type: 'cash', initialBalance: '' }).success).toBe(true);
    expect(schema.safeParse({ name: '  ', type: 'cash', initialBalance: '' }).success).toBe(false);
    expect(schema.safeParse({ name: 'CIH', type: 'bank', initialBalance: 'abc' }).success).toBe(false);
  });
});
