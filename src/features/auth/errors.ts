/**
 * Traduit les erreurs techniques de Supabase en messages compréhensibles.
 * On ne montre jamais le message brut du serveur à l'utilisateur.
 */

export type AuthErrorKey =
  | 'auth.errors.invalidCredentials'
  | 'auth.errors.emailNotConfirmed'
  | 'auth.errors.userAlreadyExists'
  | 'auth.errors.weakPassword'
  | 'auth.errors.rateLimited'
  | 'auth.errors.codeExpired'
  | 'auth.errors.samePassword'
  | 'auth.errors.network'
  | 'auth.errors.notConfigured'
  | 'auth.errors.unknown';

type ErrorLike = { code?: string; status?: number; name?: string; message?: string } | null | undefined;

const BY_CODE: Record<string, AuthErrorKey> = {
  invalid_credentials: 'auth.errors.invalidCredentials',
  email_not_confirmed: 'auth.errors.emailNotConfirmed',
  user_already_exists: 'auth.errors.userAlreadyExists',
  email_exists: 'auth.errors.userAlreadyExists',
  weak_password: 'auth.errors.weakPassword',
  over_email_send_rate_limit: 'auth.errors.rateLimited',
  over_request_rate_limit: 'auth.errors.rateLimited',
  over_sms_send_rate_limit: 'auth.errors.rateLimited',
  otp_expired: 'auth.errors.codeExpired',
  same_password: 'auth.errors.samePassword',
};

export function authErrorKey(error: ErrorLike): AuthErrorKey {
  if (!error) return 'auth.errors.unknown';
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code]!;
  if (error.status === 429) return 'auth.errors.rateLimited';
  if (error.name === 'AuthRetryableFetchError' || /network|fetch/i.test(error.message ?? '')) {
    return 'auth.errors.network';
  }
  return 'auth.errors.unknown';
}
