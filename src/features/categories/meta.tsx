import type { TFunction } from 'i18next';
import { createElement } from 'react';
import {
  Banknote,
  Briefcase,
  Bus,
  Clapperboard,
  Coins,
  GraduationCap,
  HandCoins,
  HandHeart,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  PiggyBank,
  Send,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Store,
  Tag,
  TriangleAlert,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

import type { AccountType, Category } from '@/features/transactions/types';

/** Icônes des catégories (clé enregistrée en base → dessin). */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: ShoppingCart,
  transport: Bus,
  housing: House,
  bills: Zap,
  phone: Smartphone,
  mobile_money: Send,
  education: GraduationCap,
  health: HeartPulse,
  family: Users,
  leisure: Clapperboard,
  clothing: Shirt,
  donations: HandHeart,
  unexpected: TriangleAlert,
  other: ShoppingBag,
  salary: Briefcase,
  freelance: Laptop,
  family_support: HandCoins,
  sales: Store,
  other_income: Coins,
  tag: Tag,
};

export function categoryIcon(category: Pick<Category, 'icon'> | undefined): LucideIcon {
  return (category?.icon && CATEGORY_ICONS[category.icon]) || Tag;
}

/** Libellé : traduit pour les catégories du système, tel quel pour les personnelles. */
export function categoryLabel(category: Pick<Category, 'key' | 'name'> | undefined, t: TFunction): string {
  if (!category) return '—';
  if (category.key) return t(`categories.${category.key}` as never, { defaultValue: category.key }) as string;
  return category.name ?? '—';
}

export const ACCOUNT_ICONS: Record<AccountType, LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  mobile_money: Smartphone,
  savings: PiggyBank,
  other: Wallet,
};

/** Affiche l'icône d'une catégorie (choisie dans une liste fixe). */
export function CategoryGlyph({
  category,
  size,
  color,
}: {
  category: Pick<Category, 'icon'> | undefined;
  size: number;
  color: string;
}) {
  return createElement(categoryIcon(category), { size, color });
}
