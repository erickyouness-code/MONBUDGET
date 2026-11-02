import { QueryClient } from '@tanstack/react-query';

/** Cache des données venant du serveur (profil, puis transactions, budgets…). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});
