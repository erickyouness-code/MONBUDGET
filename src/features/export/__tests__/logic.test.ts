import { csvCell, csvFormatFor, dataJson, exportFileName, plainAmount, transactionsCsv, type CsvLabels, type ExportTransaction } from '../logic';

const labels: CsvLabels = {
  headers: ['Date', 'Type', 'Montant', 'Devise', 'Catégorie', 'Compte', 'Vers le compte', 'Paiement', 'Description'],
  type: (t) => ({ expense: 'Dépense', income: 'Revenu', transfer: 'Transfert' })[t],
  category: (id) => (id === 'c1' ? 'Alimentation' : 'Sans catégorie'),
  account: (id) => (id === 'a1' ? 'Espèces' : id === 'a2' ? 'Banque' : ''),
  payment: (m) => (m === 'card' ? 'Carte' : ''),
};
const tx = (o: Partial<ExportTransaction>): ExportTransaction => ({
  id: 't', type: 'expense', amount_minor: 0, occurred_on: '2026-11-01', category_id: null, account_id: 'a1', to_account_id: null, payment_method: null, description: null, ...o,
});

describe('export', () => {
  it('format adapté à la langue (Excel français : « ; » et virgule)', () => {
    expect(csvFormatFor('fr')).toEqual({ separator: ';', decimal: ',' });
    expect(csvFormatFor('ar')).toEqual({ separator: ';', decimal: ',' });
    expect(csvFormatFor('en')).toEqual({ separator: ',', decimal: '.' });
  });

  it('montants exacts, sans arrondi', () => {
    expect(plainAmount(125050, 'MAD', ',')).toBe('1250,50');
    expect(plainAmount(-5, 'MAD', '.')).toBe('-0.05');
    expect(plainAmount(1500000, 'XAF', ',')).toBe('1500000');
  });

  it('cellules : guillemets, séparateurs, retours à la ligne et formules neutralisées', () => {
    expect(csvCell('Café; croissant', ';')).toBe('"Café; croissant"');
    expect(csvCell('Dit "bonjour"', ';')).toBe('"Dit ""bonjour"""');
    expect(csvCell('ligne1\nligne2', ';')).toBe('"ligne1\nligne2"');
    expect(csvCell('=HYPERLINK("x")', ';')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('-2+3', ',')).toBe("'-2+3");
    expect(csvCell(-2500, ';')).toBe('-2500'); // un nombre négatif reste un nombre
    expect(csvCell(null, ';')).toBe('');
  });

  it('CSV des transactions : trié, signé, transferts sans catégorie', () => {
    const csv = transactionsCsv(
      [
        tx({ id: 't2', occurred_on: '2026-11-03', type: 'transfer', amount_minor: 10000, account_id: 'a2', to_account_id: 'a1' }),
        tx({ id: 't1', occurred_on: '2026-11-02', amount_minor: 4550, category_id: 'c1', payment_method: 'card', description: 'Marjane' }),
        tx({ id: 't3', occurred_on: '2026-11-04', type: 'income', amount_minor: 800000, description: '=SOMME(A1)' }),
      ],
      'MAD',
      'fr',
      labels,
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Date;Type;Montant;Devise;Catégorie;Compte;Vers le compte;Paiement;Description',
      '2026-11-02;Dépense;-45,50;MAD;Alimentation;Espèces;;Carte;Marjane',
      '2026-11-03;Transfert;100,00;MAD;;Banque;Espèces;;',
      "2026-11-04;Revenu;8000,00;MAD;Sans catégorie;Espèces;;;'=SOMME(A1)",
      '',
    ]);
  });

  it('JSON complet et noms de fichiers', () => {
    const json = JSON.parse(dataJson({ accounts: [{ id: 'a1' }], transactions: [] }, { exportedAt: '2026-11-12T10:00:00.000Z', currency: 'MAD' }));
    expect(json).toMatchObject({ app: 'MonBudget', format_version: 1, currency: 'MAD', accounts: [{ id: 'a1' }], transactions: [] });
    expect(exportFileName('transactions', '2026-11-12', 'csv')).toBe('monbudget-transactions-2026-11-12.csv');
  });
});
