import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import Purchases, { PURCHASES_ERROR_CODE, type PurchasesPackage } from 'react-native-purchases';

/**
 * Achats intégrés (App Store / Google Play) via RevenueCat.
 *
 * Les clés ci-dessous sont les clés PUBLIQUES du SDK RevenueCat (prévues pour
 * être dans l'application). La clé SECRÈTE reste sur le serveur (fonctions Edge).
 * Aucun paiement n'est déclenché sans une action explicite de l'utilisateur,
 * confirmée ensuite dans la fenêtre officielle d'Apple ou de Google.
 */
const KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
};

export type PurchaseAvailability = 'available' | 'expoGo' | 'notConfigured' | 'web';

export function purchaseAvailability(): PurchaseAvailability {
  if (Platform.OS === 'web') return 'web';
  const key = Platform.OS === 'ios' ? KEYS.ios : KEYS.android;
  if (!key) return 'notConfigured';
  // Dans Expo Go, RevenueCat fonctionne en « mode aperçu » : pas de vrai paiement possible.
  if (Constants.executionEnvironment === 'storeClient') return 'expoGo';
  return 'available';
}

let configured = false;

/** Configure RevenueCat et l'associe à l'utilisateur Supabase (même identifiant). */
export async function identifyPurchaser(userId: string): Promise<void> {
  if (purchaseAvailability() !== 'available') return;
  if (!configured) {
    Purchases.configure({ apiKey: Platform.OS === 'ios' ? KEYS.ios : KEYS.android, appUserID: userId });
    configured = true;
    return;
  }
  await Purchases.logIn(userId);
}

export async function forgetPurchaser(): Promise<void> {
  if (configured) await Purchases.logOut().catch(() => undefined);
}

/** Offre mensuelle configurée dans RevenueCat (offre « current »). */
export async function getMonthlyPackage(): Promise<PurchasesPackage | null> {
  if (purchaseAvailability() !== 'available') return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current?.monthly ?? offerings.current?.availablePackages[0] ?? null;
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'pending' | 'error';

/** Lance l'achat : la fenêtre du store demande la confirmation de l'utilisateur. */
export async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  try {
    await Purchases.purchasePackage(pkg);
    return 'purchased';
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
    if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
    return 'error';
  }
}

export async function restore(): Promise<boolean> {
  if (purchaseAvailability() !== 'available') return false;
  try {
    await Purchases.restorePurchases();
    return true;
  } catch {
    return false;
  }
}

/** Ouvre la gestion de l'abonnement (annulation, moyen de paiement) chez Apple ou Google. */
export async function openManageSubscription(): Promise<void> {
  if (purchaseAvailability() === 'available') {
    try {
      await Purchases.showManageSubscriptions();
      return;
    } catch {
      // repli ci-dessous
    }
  }
  await Linking.openURL(
    Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions',
  );
}
