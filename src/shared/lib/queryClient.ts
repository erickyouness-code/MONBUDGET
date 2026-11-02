import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager, QueryClient, type Query } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { Platform } from 'react-native';

/** Cache des données venant du serveur (profil, transactions, budgets…). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      // Gardé assez longtemps pour être réutilisé hors connexion.
      gcTime: 7 * 24 * 60 * 60 * 1000,
    },
    mutations: {
      // Hors connexion, une modification échoue tout de suite avec un message,
      // au lieu de rester bloquée en attente.
      networkMode: 'always',
    },
  },
});

/** Connexion détectée par le téléphone (sur le web, TanStack écoute déjà le navigateur). */
export function isOnlineState(state: Pick<Network.NetworkState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

if (Platform.OS !== 'web') {
  onlineManager.setEventListener((setOnline) => {
    void Network.getNetworkStateAsync()
      .then((s) => setOnline(isOnlineState(s)))
      .catch(() => undefined);
    const sub = Network.addNetworkStateListener((s) => setOnline(isOnlineState(s)));
    return () => sub.remove();
  });
}

/**
 * Copie du cache sur le téléphone, pour consulter ses données sans connexion.
 * Effacée à la déconnexion et à la suppression du compte.
 */
export const queryPersister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'monbudget.cache', throttleTime: 1000 });

export function shouldPersistQuery(query: Pick<Query, 'queryKey' | 'state'>): boolean {
  // L'offre du store est relue à chaque fois ; seules les données chargées avec succès sont gardées.
  return query.state.status === 'success' && query.queryKey[0] !== 'offering';
}

export const persistOptions = {
  persister: queryPersister,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  // À changer si la forme des données en cache change (vide le cache des utilisateurs).
  buster: 'v1',
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
};

/** Efface toutes les données en cache (mémoire et téléphone). */
export async function clearCachedData(): Promise<void> {
  queryClient.clear();
  await queryPersister.removeClient();
}
