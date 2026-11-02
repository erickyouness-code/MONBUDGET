import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { CurrencyCode } from '@/shared/config/currencies';
import { useLanguage } from '@/shared/i18n';
import { formatMoneyCompact } from '@/shared/lib/money';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Card } from '@/shared/ui';
import type { CardTone } from '@/shared/ui/Card';

/** Carte avec un titre, une action facultative à droite et un contenu. */
export function SectionCard({
  title,
  accessory,
  children,
}: {
  title: string;
  accessory?: ReactNode;
  children: ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <Card style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="headline" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {title}
        </AppText>
        {accessory}
      </View>
      {children}
    </Card>
  );
}

/** Petite étiquette arrondie (ex. « 6 derniers mois »). */
export function Chip({ label }: { label: string }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
      }}
    >
      <AppText variant="small" color="textSecondary">
        {label}
      </AppText>
    </View>
  );
}

/** Lien texte « Tout voir ». */
export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
      {({ pressed }) => (
        <AppText variant="caption" color="primary" style={{ opacity: pressed ? 0.6 : 1 }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

/** Tuile teintée affichant un chiffre clé (revenus, dépenses…). */
export function StatTile({
  label,
  amountMinor,
  currency,
  tone,
  icon: Icon,
}: {
  label: string;
  amountMinor: number;
  currency: CurrencyCode;
  tone: Extract<CardTone, 'income' | 'expense' | 'violet'>;
  icon: LucideIcon;
}) {
  const { colors, spacing, radius } = useTheme();
  const accent = { income: colors.income, expense: colors.expense, violet: colors.primary }[tone];
  const language = useLanguage();
  // Les grands montants (fréquents en FCFA) passent en taille réduite pour rester entiers.
  const long = formatMoneyCompact(amountMinor, currency, language).length > 11;

  return (
    <Card tone={tone} style={{ flex: 1, gap: spacing.sm, padding: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={14} color={accent} strokeWidth={2.4} />
        </View>
        <AppText variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </AppText>
      </View>
      <AmountText
        amountMinor={amountMinor}
        currency={currency}
        variant={long ? 'headline' : 'amount'}
        compact
        numberOfLines={1}
        adjustsFontSizeToFit
      />
    </Card>
  );
}

/** Ligne avec icône, libellé, sous-titre et montant (abonnements, transactions). */
export function MoneyRow({
  icon: Icon,
  title,
  subtitle,
  amountMinor,
  currency,
  showSign = false,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  amountMinor: number;
  currency: CurrencyCode;
  showSign?: boolean;
}) {
  const { colors, spacing, radius } = useTheme();
  const isIncome = amountMinor > 0 && showSign;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: radius.md,
          backgroundColor: isIncome ? colors.incomeSoft : colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={20} color={isIncome ? colors.income : colors.textSecondary} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textTertiary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <AmountText
        amountMinor={amountMinor}
        currency={currency}
        compact
        signDisplay={showSign ? 'always' : 'never'}
        color={isIncome ? 'income' : 'text'}
      />
    </View>
  );
}

/** Message discret affiché dans une carte sans données. */
export function EmptyHint({ text, action }: { text: string; action?: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
      <AppText variant="caption" color="textTertiary" align="center">
        {text}
      </AppText>
      {action}
    </View>
  );
}
