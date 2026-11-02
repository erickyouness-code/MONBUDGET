import { Eye, EyeOff } from 'lucide-react-native';
import { forwardRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, TextInput, View, type TextInputProps, type TextStyle } from 'react-native';

import { useIsRTL } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Clé de traduction ou texte de l'erreur. */
  error?: string;
  hint?: string;
  /** Ajoute le bouton « afficher / masquer » pour les mots de passe. */
  password?: boolean;
};

// Supprime le contour bleu du navigateur (la bordure colorée suffit).
const webNoOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle;

/** Champ de saisie avec libellé, aide et message d'erreur. */
export const TextField = forwardRef<ComponentRef<typeof TextInput>, Props>(function TextField(
  { label, error, hint, password, onFocus, onBlur, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const { colors, spacing, radius, typography } = useTheme();
  const isRTL = useIsRTL();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;
  // Les erreurs de validation sont des clés de traduction ; on les traduit ici.
  const errorText = error ? (t(error as never, { defaultValue: error }) as string) : undefined;

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
        }}
      >
        <TextInput
          ref={ref}
          {...rest}
          secureTextEntry={password ? hidden : rest.secureTextEntry}
          placeholderTextColor={colors.textTertiary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          aria-invalid={!!error}
          accessibilityLabel={label}
          style={[
            typography.body,
            {
              flex: 1,
              color: colors.text,
              paddingVertical: spacing.md,
              textAlign: isRTL ? 'right' : 'left',
            },
            webNoOutline,
          ]}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(hidden ? 'auth.showPassword' : 'auth.hidePassword')}
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
          >
            {hidden ? <Eye size={20} color={colors.textTertiary} /> : <EyeOff size={20} color={colors.textTertiary} />}
          </Pressable>
        ) : null}
      </View>
      {errorText ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {errorText}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textTertiary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});
