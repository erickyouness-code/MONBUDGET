import {
  Briefcase,
  Bus,
  Clapperboard,
  Coffee,
  House,
  Music,
  ShoppingBag,
  ShoppingCart,
  Tv,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

import type { IconKey } from './types';

/** Icônes génériques (aucun logo de marque, protégés par le droit des marques). */
export const ICONS: Record<IconKey, LucideIcon> = {
  food: ShoppingCart,
  housing: House,
  transport: Bus,
  bills: Zap,
  leisure: Clapperboard,
  other: ShoppingBag,
  salary: Briefcase,
  cafe: Coffee,
  shopping: ShoppingBag,
  video: Tv,
  music: Music,
  internet: Wifi,
};
