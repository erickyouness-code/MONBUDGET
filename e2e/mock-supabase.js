// Faux serveur Supabase pour les tests de parcours : authentification, tables
// (profils, comptes, catégories, transactions), vue des soldes et fonction
// monthly_overview. Les calculs reproduisent ceux de la vraie base.
const { Buffer } = require('node:buffer');

const API = 'https://test-project.supabase.co';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const EMAIL = 'amina@example.com';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
// Jeton valable un an : les tests peuvent figer l'horloge du navigateur.
const jwt = () =>
  `${b64({ alg: 'HS256' })}.${b64({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 365 * 86400 })}.sig`;
const user = { id: USER_ID, email: EMAIL, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, identities: [{ id: '1' }], created_at: '2026-01-01T00:00:00Z' };
const session = () => ({ access_token: jwt(), token_type: 'bearer', expires_in: 365 * 86400, expires_at: Math.floor(Date.now() / 1000) + 365 * 86400, refresh_token: 'r', user });

const SYSTEM_CATEGORIES = [
  ['expense', 'food', 10, '#5B4FE0'], ['expense', 'transport', 20, '#4C8DF6'], ['expense', 'housing', 30, '#B072E8'],
  ['expense', 'bills', 40, '#F5A524'], ['expense', 'phone', 50, '#2BB3C0'], ['expense', 'mobile_money', 60, '#3CC386'],
  ['expense', 'health', 80, '#E5566B'], ['expense', 'other', 990, '#A3A1B8'],
  ['income', 'salary', 10, '#1E9E62'], ['income', 'freelance', 20, '#3CC386'], ['income', 'other_income', 990, '#A3A1B8'],
];

function createDb({ onboarded = false } = {}) {
  let seq = 0;
  const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const db = {
    uid,
    profile: {
      id: USER_ID,
      display_name: onboarded ? 'Amina' : null,
      country_code: onboarded ? 'MA' : null,
      currency_code: onboarded ? 'MAD' : null,
      language: 'fr',
      onboarding_completed_at: onboarded ? '2026-01-01T00:00:00Z' : null,
    },
    accounts: [],
    transactions: [],
    budgets: [],
    goals: [],
    contributions: [],
    scheduled: [],
    completions: [],
    // Droit d'accès (écrit par le serveur). Par défaut : actif, pour les parcours non liés à l'abonnement.
    entitlement: { period_type: 'normal', expires_at: '2099-01-01T00:00:00Z', will_renew: true, billing_issue: false, store: 'app_store' },
    syncCalls: 0,
    onSync: null,
    categories: SYSTEM_CATEGORIES.map(([kind, key, sort_order, color]) => ({ id: uid(), user_id: null, kind, key, name: null, icon: key, color, sort_order, is_archived: false })),
  };
  db.category = (key) => db.categories.find((c) => c.key === key).id;
  db.account = (name) => db.accounts.find((a) => a.name === name);
  db.addAccount = (a) => { const row = { id: uid(), is_archived: false, created_at: '2026-01-01T00:00:00Z', initial_balance_minor: 0, currency_code: 'MAD', ...a }; db.accounts.push(row); return row; };
  db.addTx = (t) => { const row = { id: uid(), created_at: new Date(Date.now() + seq).toISOString(), to_account_id: null, category_id: null, payment_method: null, description: null, ...t }; db.transactions.push(row); return row; };
  db.balances = () =>
    db.accounts.map((a) => ({
      account_id: a.id,
      balance_minor: db.transactions.reduce((sum, t) => {
        if (t.type === 'income' && t.account_id === a.id) return sum + t.amount_minor;
        if (t.type === 'expense' && t.account_id === a.id) return sum - t.amount_minor;
        if (t.type === 'transfer' && t.account_id === a.id) return sum - t.amount_minor;
        if (t.type === 'transfer' && t.to_account_id === a.id) return sum + t.amount_minor;
        return sum;
      }, a.initial_balance_minor),
    }));
  db.balance = (name) => db.balances().find((b) => b.account_id === db.account(name)?.id)?.balance_minor;
  // Même calcul que la fonction SQL monthly_overview.
  db.monthlyOverview = (until, count) => {
    const [y, m] = until.split('-').map(Number);
    const rows = [];
    for (let i = Math.min(Math.max(count, 1), 24) - 1; i >= 0; i--) {
      const start = new Date(Date.UTC(y, m - 1 - i, 1));
      const end = new Date(Date.UTC(y, m - i, 1));
      const s = start.toISOString().slice(0, 10);
      const e = end.toISOString().slice(0, 10);
      const sum = (type) => db.transactions.filter((t) => t.type === type && t.occurred_on >= s && t.occurred_on < e).reduce((a, t) => a + t.amount_minor, 0);
      const initial = db.accounts.filter((a) => a.created_at.slice(0, 10) < e).reduce((a, x) => a + x.initial_balance_minor, 0);
      const net = db.transactions.filter((t) => t.type !== 'transfer' && t.occurred_on < e).reduce((a, t) => a + (t.type === 'income' ? t.amount_minor : -t.amount_minor), 0);
      rows.push({ month: s, income_minor: sum('income'), expense_minor: sum('expense'), end_balance_minor: initial + net });
    }
    return rows;
  };
  // Même logique que les fonctions SQL set_budget et budget_status.
  db.monthOf = (iso) => `${iso.slice(0, 7)}-01`;
  db.setBudget = (categoryId, limit, threshold, month) => {
    const existing = db.budgets.find((b) => b.category_id === categoryId && b.effective_month === month);
    if (existing) Object.assign(existing, { limit_minor: limit, alert_threshold_pct: threshold });
    else db.budgets.push({ category_id: categoryId, effective_month: month, limit_minor: limit, alert_threshold_pct: threshold });
  };
  db.budgetStatus = (monthIso) => {
    const start = db.monthOf(monthIso);
    const [y, m] = start.split('-').map(Number);
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const latest = new Map();
    for (const b of [...db.budgets].sort((a, c) => a.effective_month.localeCompare(c.effective_month))) {
      if (b.effective_month <= start) latest.set(b.category_id, b);
    }
    return [...latest.values()]
      .filter((b) => b.limit_minor !== null)
      .map((b) => ({
        category_id: b.category_id,
        limit_minor: b.limit_minor,
        alert_threshold_pct: b.alert_threshold_pct,
        spent_minor: db.transactions
          .filter((t) => t.type === 'expense' && t.occurred_on >= start && t.occurred_on < end && (b.category_id === null || t.category_id === b.category_id))
          .reduce((a, t) => a + t.amount_minor, 0),
      }));
  };
  // Objectifs : même calcul que la vue goal_progress.
  db.addGoal = (g) => { const row = { id: uid(), icon: 'piggy', target_date: null, currency_code: 'MAD', is_archived: false, created_at: new Date().toISOString(), ...g }; db.goals.push(row); return row; };
  db.addContribution = (c) => { const row = { id: uid(), note: null, is_initial: false, created_at: new Date(Date.now() + seq).toISOString(), occurred_on: db.today || new Date().toISOString().slice(0, 10), ...c }; db.contributions.push(row); return row; };
  db.saved = (goalId) => db.contributions.filter((c) => c.goal_id === goalId).reduce((a, c) => a + c.amount_minor, 0);
  db.goalProgress = () => {
    const today = db.today || new Date().toISOString().slice(0, 10);
    const limit = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);
    return db.goals.map((g) => {
      const list = db.contributions.filter((c) => c.goal_id === g.id);
      return {
        goal_id: g.id,
        saved_minor: list.reduce((a, c) => a + c.amount_minor, 0),
        saved_last_90_minor: list.filter((c) => c.occurred_on > limit && !c.is_initial).reduce((a, c) => a + c.amount_minor, 0),
        last_contribution_on: list.map((c) => c.occurred_on).sort().pop() ?? null,
      };
    });
  };
  // Calendrier : même logique que complete_occurrence / undo_occurrence.
  db.addScheduled = (i) => { const row = { id: uid(), category_id: null, account_id: null, frequency: 'monthly', interval_count: 1, end_date: null, remind_days_before: 1, is_active: true, note: null, ...i }; db.scheduled.push(row); return row; };
  db.complete = ({ p_item_id, p_due_on, p_status, p_account_id }) => {
    const item = db.scheduled.find((i) => i.id === p_item_id);
    if (!item) return { status: 404, body: { code: 'P0002', message: 'Échéance introuvable' } };
    if (db.completions.some((c) => c.item_id === p_item_id && c.due_on === p_due_on)) return { status: 409, body: { code: '23505', message: 'duplicate' } };
    let txId = null;
    if (p_status === 'paid' && item.amount_minor !== null) {
      const account = p_account_id ?? item.account_id;
      if (!account) return { status: 400, body: { code: '23502', message: 'Choisissez un compte' } };
      const income = item.kind === 'income';
      const tx = db.addTx({
        type: income ? 'income' : 'expense',
        amount_minor: item.amount_minor,
        occurred_on: db.today || new Date().toISOString().slice(0, 10),
        account_id: account,
        category_id: item.category_id ?? db.category(income ? 'other_income' : 'other'),
        description: item.title,
      });
      txId = tx.id;
    }
    const row = { id: uid(), item_id: p_item_id, due_on: p_due_on, status: p_status, transaction_id: txId };
    db.completions.push(row);
    return { status: 200, body: row.id };
  };
  db.undo = (completionId) => {
    const c = db.completions.find((x) => x.id === completionId);
    if (!c) return;
    db.completions = db.completions.filter((x) => x !== c);
    if (c.transaction_id) db.transactions = db.transactions.filter((t) => t.id !== c.transaction_id);
  };
  return db;
}

function applyFilters(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (['select', 'order', 'offset', 'limit', 'or'].includes(k)) continue;
    const [op, ...rest] = v.split('.');
    const val = rest.join('.');
    if (op === 'eq') out = out.filter((r) => String(r[k]) === val);
    if (op === 'gte') out = out.filter((r) => r[k] >= val);
    if (op === 'lte') out = out.filter((r) => r[k] <= val);
    if (op === 'in') { const set = val.replace(/[()]/g, '').split(','); out = out.filter((r) => set.includes(String(r[k]))); }
  }
  const or = params.get('or');
  if (or) {
    const text = (or.match(/description\.ilike\."%(.*?)%"/) || [])[1];
    const ids = ((or.match(/category_id\.in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean);
    out = out.filter((r) => (text && (r.description || '').toLowerCase().includes(text.toLowerCase())) || ids.includes(r.category_id));
  }
  const offset = Number(params.get('offset') || 0);
  const limit = params.get('limit') ? Number(params.get('limit')) : undefined;
  return limit ? out.slice(offset, offset + limit) : out.slice(offset);
}

async function installMock(page, db) {
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: cors });
    const empty = (status) => route.fulfill({ status, headers: cors, body: '' });
    if (method === 'OPTIONS') return json(200, {});
    const p = url.pathname;
    const params = url.searchParams;

    if (p === '/auth/v1/token') return json(200, session());
    if (p === '/auth/v1/logout') return empty(204);
    if (p === '/auth/v1/user') return json(200, user);

    if (p === '/rest/v1/profiles') {
      if (method === 'PATCH') Object.assign(db.profile, body);
      return json(200, db.profile);
    }
    if (p === '/rest/v1/rpc/monthly_overview') return json(200, db.monthlyOverview(body.p_until, body.p_months));
    if (p === '/rest/v1/rpc/budget_status') return json(200, db.budgetStatus(body.p_month));
    if (p === '/rest/v1/rpc/set_budget') {
      // « Mois en cours » = celui du navigateur (horloge éventuellement figée par le test).
      db.setBudget(body.p_category_id, body.p_limit_minor, body.p_threshold_pct, db.monthOf(db.today || new Date().toISOString()));
      return empty(204);
    }
    if (p === '/rest/v1/account_balances') return json(200, db.balances());
    if (p === '/rest/v1/goal_progress') return json(200, db.goalProgress());
    if (p === '/rest/v1/entitlements') {
      const row = db.entitlement;
      if (single) return row ? json(200, row) : json(406, { code: 'PGRST116', message: 'no rows' });
      return json(200, row ? [row] : []);
    }
    if (p === '/functions/v1/sync-entitlement') {
      db.syncCalls++;
      if (db.onSync) db.onSync();
      return json(200, { active: !!db.entitlement && Date.parse(db.entitlement.expires_at) > Date.now() });
    }
    if (p === '/rest/v1/rpc/complete_occurrence') { const r = db.complete(body); return json(r.status, r.body); }
    if (p === '/rest/v1/rpc/undo_occurrence') { db.undo(body.p_completion_id); return empty(204); }
    if (p === '/rest/v1/scheduled_completions') return json(200, db.completions);
    if (p === '/rest/v1/scheduled_items') {
      if (method === 'POST') { for (const r of [].concat(body)) db.addScheduled(r); return empty(201); }
      const target = applyFilters(db.scheduled, params);
      if (method === 'PATCH') { target.forEach((i) => Object.assign(i, body)); return empty(204); }
      if (method === 'DELETE') {
        db.completions = db.completions.filter((c) => !target.some((i) => i.id === c.item_id));
        db.scheduled = db.scheduled.filter((i) => !target.includes(i));
        return empty(204);
      }
      return json(200, target);
    }
    if (p === '/rest/v1/savings_goals') {
      if (method === 'POST') {
        const row = db.addGoal({ ...body, created_at: `${db.today || new Date().toISOString().slice(0, 10)}T10:00:00Z` });
        return single ? json(201, { id: row.id }) : empty(201);
      }
      const target = applyFilters(db.goals, params);
      if (method === 'PATCH') { target.forEach((g) => Object.assign(g, body)); return empty(204); }
      if (method === 'DELETE') {
        db.contributions = db.contributions.filter((c) => !target.some((g) => g.id === c.goal_id));
        db.goals = db.goals.filter((g) => !target.includes(g));
        return empty(204);
      }
      return json(200, target);
    }
    if (p === '/rest/v1/goal_contributions') {
      if (method === 'POST') {
        for (const r of [].concat(body)) {
          if (db.saved(r.goal_id) + r.amount_minor < 0) return json(400, { code: '23514', message: 'Le retrait dépasse le montant épargné' });
          db.addContribution(r);
        }
        return empty(201);
      }
      const sorted = [...db.contributions].sort((a, b) => (b.occurred_on + b.created_at).localeCompare(a.occurred_on + a.created_at));
      const target = applyFilters(sorted, params);
      if (method === 'DELETE') { db.contributions = db.contributions.filter((c) => !target.includes(c)); return empty(204); }
      return json(200, target);
    }
    if (p === '/rest/v1/categories') {
      if (method === 'POST') {
        const row = { id: db.uid(), user_id: USER_ID, key: null, color: null, is_archived: false, ...body };
        db.categories.push(row);
        return single ? json(201, row) : empty(201);
      }
      return json(200, [...db.categories].sort((a, b) => a.sort_order - b.sort_order));
    }
    if (p === '/rest/v1/accounts') {
      if (method === 'POST') {
        for (const r of [].concat(body)) db.accounts.push({ id: db.uid(), is_archived: false, created_at: new Date().toISOString(), ...r });
        return empty(201);
      }
      const target = applyFilters(db.accounts, params);
      if (method === 'PATCH') { target.forEach((a) => Object.assign(a, body)); return empty(204); }
      if (method === 'DELETE') {
        if (target.some((a) => db.transactions.some((t) => t.account_id === a.id || t.to_account_id === a.id)))
          return json(409, { code: '23503', message: 'violates foreign key constraint' });
        db.accounts = db.accounts.filter((a) => !target.includes(a));
        return empty(204);
      }
      return json(200, target);
    }
    if (p === '/rest/v1/transactions') {
      if (method === 'POST') {
        for (const r of [].concat(body)) db.addTx(r);
        return empty(201);
      }
      const sorted = [...db.transactions].sort((a, b) => (b.occurred_on + b.created_at).localeCompare(a.occurred_on + a.created_at));
      const target = applyFilters(sorted, params);
      if (method === 'PATCH') { target.forEach((t) => Object.assign(t, body)); return empty(204); }
      if (method === 'DELETE') { db.transactions = db.transactions.filter((t) => !target.includes(t)); return empty(204); }
      return single ? json(200, target[0]) : json(200, target);
    }
    return json(404, { message: 'non simulé' });
  });
}

function checker() {
  const lines = [];
  const check = (name, ok, extra = '') => {
    lines.push(`${ok ? '✔' : '✘'} ${name}${ok ? '' : ' ' + extra}`);
    if (!ok) process.exitCode = 1;
  };
  return { check, report: () => console.log(lines.join('\n')) };
}

module.exports = { API, EMAIL, USER_ID, createDb, installMock, checker };
