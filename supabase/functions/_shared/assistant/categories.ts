import type { Lang } from './format.ts';

/** Libellés des catégories système (copie des traductions de l'application, vérifiée par un test). */
export const CATEGORY_LABELS: Record<string, Record<Lang, string>> = {
  food: { fr: 'Alimentation', en: 'Groceries', ar: 'التغذية' },
  housing: { fr: 'Loyer', en: 'Rent', ar: 'الكراء' },
  transport: { fr: 'Transport', en: 'Transport', ar: 'النقل' },
  bills: { fr: 'Factures', en: 'Bills', ar: 'الفواتير' },
  leisure: { fr: 'Loisirs', en: 'Leisure', ar: 'الترفيه' },
  other: { fr: 'Autres', en: 'Other', ar: 'أخرى' },
  phone: { fr: 'Téléphone & recharges', en: 'Phone & top-ups', ar: 'الهاتف والتعبئة' },
  mobile_money: { fr: 'Frais Mobile Money', en: 'Mobile Money fees', ar: 'رسوم المحفظة الإلكترونية' },
  education: { fr: 'Études', en: 'Education', ar: 'الدراسة' },
  health: { fr: 'Santé', en: 'Health', ar: 'الصحة' },
  family: { fr: 'Famille', en: 'Family', ar: 'العائلة' },
  clothing: { fr: 'Vêtements', en: 'Clothing', ar: 'الملابس' },
  donations: { fr: 'Dons', en: 'Donations', ar: 'التبرعات' },
  unexpected: { fr: 'Imprévus', en: 'Unexpected', ar: 'طوارئ' },
  salary: { fr: 'Salaire', en: 'Salary', ar: 'الراتب' },
  freelance: { fr: 'Activité indépendante', en: 'Freelance work', ar: 'عمل حر' },
  family_support: { fr: 'Aide familiale', en: 'Family support', ar: 'مساعدة عائلية' },
  sales: { fr: 'Ventes', en: 'Sales', ar: 'مبيعات' },
  other_income: { fr: 'Autres revenus', en: 'Other income', ar: 'مداخيل أخرى' },
};

export const UNCATEGORIZED: Record<Lang, string> = { fr: 'Sans catégorie', en: 'Uncategorized', ar: 'بدون فئة' };
export const OVERALL_BUDGET: Record<Lang, string> = { fr: 'Budget global du mois', en: 'Overall monthly budget', ar: 'الميزانية الشهرية الإجمالية' };

export type CategoryLike = { id: string; key: string | null; name: string | null; kind: 'expense' | 'income' };

export function categoryName(category: CategoryLike | undefined, lang: Lang): string {
  if (!category) return UNCATEGORIZED[lang];
  if (category.key) return CATEGORY_LABELS[category.key]?.[lang] ?? category.name ?? category.key;
  return category.name ?? UNCATEGORIZED[lang];
}

/** Comparaison sans accents ni majuscules ("telephone" trouve "Téléphone & recharges"). */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Catégories correspondant à une recherche (clé, nom dans n'importe quelle langue). */
export function matchCategories(categories: CategoryLike[], query: string): CategoryLike[] {
  const q = normalize(query);
  if (!q) return [];
  return categories.filter((c) => {
    const names = [c.key ?? '', c.name ?? '', ...(c.key ? Object.values(CATEGORY_LABELS[c.key] ?? {}) : [])];
    return names.some((n) => n && (normalize(n) === q || normalize(n).includes(q)));
  });
}
