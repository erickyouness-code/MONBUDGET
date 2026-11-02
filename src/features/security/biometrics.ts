import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type BiometricAvailability = 'available' | 'notEnrolled' | 'unsupported';

/** Biométrie ou code du téléphone disponibles ? (jamais sur le web) */
export async function biometricAvailability(): Promise<BiometricAvailability> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level === LocalAuthentication.SecurityLevel.NONE ? 'notEnrolled' : 'available';
  } catch {
    return 'unsupported';
  }
}

/**
 * Demande le visage, l'empreinte ou le code du téléphone. Rien n'est stocké
 * par l'application : la vérification est faite par le système.
 */
export async function authenticate(prompt: string, cancelLabel: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel, disableDeviceFallback: false });
    return result.success;
  } catch {
    return false;
  }
}
