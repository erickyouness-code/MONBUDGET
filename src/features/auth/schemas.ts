import { z } from 'zod';

/**
 * Règles de validation des formulaires de connexion.
 * Les messages sont des clés de traduction (affichées dans la langue choisie).
 * Le serveur Supabase applique aussi ses propres contrôles : ceci évite
 * seulement des allers-retours inutiles et guide l'utilisateur.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'auth.errors.emailRequired')
  .pipe(z.email('auth.errors.emailInvalid'));

export const PASSWORD_MIN = 8;

const password = z
  .string()
  .min(PASSWORD_MIN, 'auth.errors.passwordTooShort')
  .max(72, 'auth.errors.passwordTooLong') // limite technique de bcrypt
  .regex(/[A-Za-z]/, 'auth.errors.passwordNeedsLetter')
  .regex(/\d/, 'auth.errors.passwordNeedsDigit');

/** Code reçu par e-mail : uniquement des chiffres (6 à 10 selon la configuration). */
const otp = z
  .string()
  .trim()
  .regex(/^\d{6,10}$/, 'auth.errors.codeInvalid');

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'auth.errors.passwordRequired'),
});

export const signUpSchema = z.object({ email, password });

export const forgotPasswordSchema = z.object({ email });

export const verifySchema = z.object({ code: otp });

export const resetPasswordSchema = z.object({ code: otp, password });

export const onboardingSchema = z.object({
  country: z.enum(['MA', 'GA'], { error: 'onboarding.errors.countryRequired' }),
  currency: z.enum(['MAD', 'XAF']),
  displayName: z
    .string()
    .trim()
    .max(60, 'onboarding.errors.nameTooLong')
    .optional()
    .transform((v) => (v ? v : null)),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type VerifyValues = z.infer<typeof verifySchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingValues = z.output<typeof onboardingSchema>;
