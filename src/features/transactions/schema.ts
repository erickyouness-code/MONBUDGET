import { z } from 'zod';

import type { CurrencyCode } from '@/shared/config/currencies';
import { parseAmountToMinor } from '@/shared/lib/money';

import type { TransactionWrite } from './types';

/**
 * Validation du formulaire de transaction. Les messages sont des clés de
 * traduction. La base de données refait les mêmes contrôles côté serveur.
 */
export function makeTransactionSchema(currency: CurrencyCode) {
  return z
    .object({
      type: z.enum(['expense', 'income', 'transfer']),
      amount: z.string().refine((v) => (parseAmountToMinor(v, currency) ?? 0) > 0, 'transactions.errors.amountInvalid'),
      accountId: z.string().min(1, 'transactions.errors.accountRequired'),
      toAccountId: z.string().nullable(),
      categoryId: z.string().nullable(),
      occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'mobile_money', 'check', 'other']).nullable(),
      description: z.string().trim().max(200, 'transactions.errors.descriptionTooLong'),
    })
    .superRefine((v, ctx) => {
      if (v.type === 'transfer') {
        if (!v.toAccountId) ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'transactions.errors.toAccountRequired' });
        else if (v.toAccountId === v.accountId)
          ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'transactions.errors.sameAccount' });
      } else if (!v.categoryId) {
        ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'transactions.errors.categoryRequired' });
      }
    });
}

export type TransactionFormValues = z.infer<ReturnType<typeof makeTransactionSchema>>;

/** Convertit le formulaire validé en ligne pour la base (champs incohérents remis à vide). */
export function toTransactionWrite(values: TransactionFormValues, currency: CurrencyCode): TransactionWrite {
  const isTransfer = values.type === 'transfer';
  return {
    type: values.type,
    amount_minor: parseAmountToMinor(values.amount, currency) ?? 0,
    occurred_on: values.occurredOn,
    account_id: values.accountId,
    to_account_id: isTransfer ? values.toAccountId : null,
    category_id: isTransfer ? null : values.categoryId,
    payment_method: isTransfer ? null : values.paymentMethod,
    description: values.description ? values.description : null,
  };
}

/** Validation du formulaire de compte. */
export function makeAccountSchema(currency: CurrencyCode) {
  return z.object({
    name: z.string().trim().min(1, 'accounts.errors.nameRequired').max(50, 'accounts.errors.nameTooLong'),
    type: z.enum(['cash', 'bank', 'mobile_money', 'savings', 'other']),
    initialBalance: z
      .string()
      .refine((v) => v.trim() === '' || parseAmountToMinor(v, currency) !== null, 'transactions.errors.amountInvalid'),
  });
}

export type AccountFormValues = z.infer<ReturnType<typeof makeAccountSchema>>;
