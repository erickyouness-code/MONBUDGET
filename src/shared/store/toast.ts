import { create } from 'zustand';

export type Toast = {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  /** Écran à ouvrir si l'utilisateur touche le message. */
  href?: '/budgets';
};

type ToastState = {
  current: Toast | null;
  show: (toast: Omit<Toast, 'id'>) => void;
  dismiss: () => void;
};

let counter = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Message éphémère affiché en haut de l'écran (un seul à la fois). */
export const useToast = create<ToastState>((set) => ({
  current: null,
  show: (toast) => {
    if (timer) clearTimeout(timer);
    set({ current: { ...toast, id: ++counter } });
    timer = setTimeout(() => set({ current: null }), 6000);
  },
  dismiss: () => {
    if (timer) clearTimeout(timer);
    set({ current: null });
  },
}));
