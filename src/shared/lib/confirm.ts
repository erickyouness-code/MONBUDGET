import { Alert, Platform } from 'react-native';

/**
 * Demande une confirmation avant une action irréversible (suppression…).
 * Sur le web, Alert ne fonctionne pas : on utilise la boîte du navigateur.
 */
export function confirmAction(options: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${options.title}\n\n${options.message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      options.title,
      options.message,
      [
        { text: options.cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: options.confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
