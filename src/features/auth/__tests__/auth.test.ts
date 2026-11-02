import { createChunkedStore, CHUNK_SIZE, type KeyValueStore } from '@/shared/lib/secureStorage';

import { authErrorKey } from '../errors';
import { onboardingSchema, resetPasswordSchema, signInSchema, signUpSchema, verifySchema } from '../schemas';

jest.mock('expo-secure-store', () => ({}));

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

describe('stockage de session découpé', () => {
  it('enregistre et relit une longue session à l’identique', async () => {
    const base = memoryStore();
    const store = createChunkedStore(base);
    const session = JSON.stringify({ token: 'x'.repeat(CHUNK_SIZE * 2 + 37) });
    await store.setItem('monbudget.auth', session);
    expect(base.data.get('monbudget.auth.count')).toBe('3');
    expect(await store.getItem('monbudget.auth')).toBe(session);
  });

  it('nettoie les anciens morceaux quand la session raccourcit', async () => {
    const base = memoryStore();
    const store = createChunkedStore(base);
    await store.setItem('k', 'a'.repeat(CHUNK_SIZE * 3));
    await store.setItem('k', 'court');
    expect(await store.getItem('k')).toBe('court');
    expect([...base.data.keys()].sort()).toEqual(['k.0', 'k.count']);
  });

  it('supprime tout à la déconnexion', async () => {
    const base = memoryStore();
    const store = createChunkedStore(base);
    await store.setItem('k', 'a'.repeat(CHUNK_SIZE + 1));
    await store.removeItem('k');
    expect(base.data.size).toBe(0);
    expect(await store.getItem('k')).toBeNull();
  });

  it('considère une session incomplète comme absente', async () => {
    const base = memoryStore();
    const store = createChunkedStore(base);
    await store.setItem('k', 'a'.repeat(CHUNK_SIZE + 1));
    base.data.delete('k.1');
    expect(await store.getItem('k')).toBeNull();
  });

  it('rend les clés compatibles avec SecureStore', async () => {
    const base = memoryStore();
    await createChunkedStore(base).setItem('sb:auth/token', 'v');
    expect(base.data.has('sb_auth_token.0')).toBe(true);
  });
});

describe('messages d’erreur', () => {
  it('traduit les codes connus de Supabase', () => {
    expect(authErrorKey({ code: 'invalid_credentials' })).toBe('auth.errors.invalidCredentials');
    expect(authErrorKey({ code: 'email_not_confirmed' })).toBe('auth.errors.emailNotConfirmed');
    expect(authErrorKey({ code: 'otp_expired' })).toBe('auth.errors.codeExpired');
    expect(authErrorKey({ status: 429 })).toBe('auth.errors.rateLimited');
    expect(authErrorKey({ name: 'AuthRetryableFetchError' })).toBe('auth.errors.network');
  });
  it('ne montre jamais un message brut inconnu', () => {
    expect(authErrorKey({ code: 'something_new', message: 'SQL error details' })).toBe('auth.errors.unknown');
    expect(authErrorKey(null)).toBe('auth.errors.unknown');
  });
});

describe('validation des formulaires', () => {
  const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

  it('normalise l’e-mail', () => {
    const r = signInSchema.safeParse({ email: '  Nom@Exemple.COM ', password: 'x' });
    expect(r.success && r.data.email).toBe('nom@exemple.com');
  });

  it('refuse un e-mail invalide ou vide', () => {
    expect(firstError(signInSchema.safeParse({ email: 'pas-un-email', password: 'x' }))).toBe('auth.errors.emailInvalid');
    expect(firstError(signInSchema.safeParse({ email: '', password: 'x' }))).toBe('auth.errors.emailRequired');
  });

  it('exige un mot de passe solide à l’inscription', () => {
    const ok = signUpSchema.safeParse({ email: 'a@b.ma', password: 'budget2026' });
    expect(ok.success).toBe(true);
    expect(firstError(signUpSchema.safeParse({ email: 'a@b.ma', password: 'abc1' }))).toBe('auth.errors.passwordTooShort');
    expect(firstError(signUpSchema.safeParse({ email: 'a@b.ma', password: 'abcdefgh' }))).toBe('auth.errors.passwordNeedsDigit');
    expect(firstError(signUpSchema.safeParse({ email: 'a@b.ma', password: '12345678' }))).toBe('auth.errors.passwordNeedsLetter');
  });

  it('accepte uniquement des codes numériques', () => {
    expect(verifySchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(verifySchema.safeParse({ code: '12ab56' }).success).toBe(false);
    expect(verifySchema.safeParse({ code: '123' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ code: '12345678', password: 'nouveau99' }).success).toBe(true);
  });

  it('valide le premier paramétrage', () => {
    const r = onboardingSchema.safeParse({ country: 'GA', currency: 'XAF', displayName: '  ' });
    expect(r.success && r.data.displayName).toBeNull();
    expect(firstError(onboardingSchema.safeParse({ country: undefined, currency: 'MAD' }))).toBe('onboarding.errors.countryRequired');
    expect(onboardingSchema.safeParse({ country: 'FR', currency: 'MAD' }).success).toBe(false);
  });
});
