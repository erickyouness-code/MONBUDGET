import type { CurrencyCode } from '@/shared/config/currencies';

/** Types alignés sur la base de données (migration 20261103000000). */

export type AccountType = 'cash' | 'bank' | 'mobile_money' | 'savings' | 'other';
export type TransactionType = 'expense' | 'income' | 'transfer';
export type CategoryKind = 'expense' | 'income';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'check' | 'other';

export const ACCOUNT_TYPES: AccountType[] = ['cash', 'bank', 'mobile_money', 'savings', 'other'];
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'bank_transfer', 'mobile_money', 'check', 'other'];

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency_code: CurrencyCode;
  initial_balance_minor: number;
  is_archived: boolean;
  created_at: string;
};

export type AccountWithBalance = Account & { balance_minor: number };

export type Category = {
  id: string;
  user_id: string | null;
  kind: CategoryKind;
  key: string | null;
  name: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_archived: boolean;
};

export type Transaction = {
  id: string;
  type: TransactionType;
  amount_minor: number;
  occurred_on: string; // AAAA-MM-JJ
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  payment_method: PaymentMethod | null;
  description: string | null;
  created_at: string;
};

/** Champs envoyés à la base pour créer ou modifier une transaction. */
export type TransactionWrite = Omit<Transaction, 'id' | 'created_at'>;
