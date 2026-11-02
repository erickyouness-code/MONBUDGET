import {
  Car,
  Gem,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PiggyBank,
  Plane,
  ShieldCheck,
  Smartphone,
  Store,
  type LucideIcon,
} from 'lucide-react-native';
import { createElement } from 'react';

/** Icônes proposées pour un objectif (clé enregistrée en base → dessin). */
export const GOAL_ICONS: Record<string, LucideIcon> = {
  piggy: PiggyBank,
  emergency: ShieldCheck,
  phone: Smartphone,
  car: Car,
  house: House,
  study: GraduationCap,
  travel: Plane,
  wedding: Gem,
  health: HeartPulse,
  business: Store,
  gift: Gift,
};

export const GOAL_ICON_KEYS = Object.keys(GOAL_ICONS);

export function GoalGlyph({ icon, size, color }: { icon: string; size: number; color: string }) {
  return createElement(GOAL_ICONS[icon] ?? PiggyBank, { size, color });
}
