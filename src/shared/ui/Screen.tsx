import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

type Props = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  /** Élément affiché à droite du titre (bouton réglages, etc.). */
  headerAccessory?: ReactNode;
  /** false pour les écrans présentés en fenêtre modale (déjà sous la barre du haut). */
  safeTop?: boolean;
}>;

/** Conteneur standard d'un écran : marges, défilement, titre. */
export function Screen({ title, subtitle, headerAccessory, safeTop = true, children }: Props) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: (safeTop ? insets.top : 0) + spacing.lg,
        paddingBottom: spacing.huge,
        paddingHorizontal: spacing.xl,
        gap: spacing.xl,
      }}
      contentInsetAdjustmentBehavior="never"
    >
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <AppText variant="title" accessibilityRole="header">
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="body" color="textSecondary">
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {headerAccessory}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}
