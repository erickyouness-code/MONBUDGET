import { router, Tabs } from 'expo-router';
import { Home, ListOrdered, Plus, Sparkles, Target, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReminderSync } from '@/features/schedule/useReminderSync';
import { useIsRTL } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';

function tabIcon(Icon: LucideIcon) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon size={24} color={String(color)} strokeWidth={focused ? 2.4 : 1.9} />;
  };
}

/** Bouton central « + » : ouvre la fenêtre d'ajout au lieu d'un onglet. */
function AddTabButton({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => router.push('/add')}
        style={({ pressed }) => ({
          width: 52,
          height: 52,
          borderRadius: 26,
          marginTop: -14, // légèrement surélevé : c'est l'action principale
          backgroundColor: pressed ? colors.primaryPressed : colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.95 : 1 }],
          boxShadow: `0 4px 12px ${colors.primary}55`,
        })}
      >
        <Plus size={26} color={colors.onPrimary} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isArabic = useIsRTL();
  // Garde les rappels du téléphone à jour tant que l'utilisateur est connecté.
  useReminderSync();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
        tabBarLabelStyle: isArabic
          ? { fontSize: 11, lineHeight: 18, fontWeight: '600' }
          : { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_600SemiBold' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: tabIcon(Home) }} />
      <Tabs.Screen name="transactions" options={{ title: t('tabs.history'), tabBarIcon: tabIcon(ListOrdered) }} />
      <Tabs.Screen
        name="new"
        options={{ title: t('tabs.add'), tabBarButton: () => <AddTabButton label={t('tabs.add')} /> }}
        listeners={{ tabPress: (event) => event.preventDefault() }}
      />
      <Tabs.Screen name="plan" options={{ title: t('tabs.plan'), tabBarIcon: tabIcon(Target) }} />
      <Tabs.Screen name="assistant" options={{ title: t('tabs.assistant'), tabBarIcon: tabIcon(Sparkles) }} />
    </Tabs>
  );
}
