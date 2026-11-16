// المحرك المالي: دوال خالصة بلا واجهة ولا تخزين — موثّقة في docs/FORMULAS.md ومختبرة في tests/calc.test.mjs
// db = { accounts, categories, debts, jamiyas, goals, recurring, budgets, transactions } (صفوف غير محذوفة)
// S  = { base_currency, display_currency, rates }  حيث rates = وحدات كل عملة مقابل 1 دولار

const p2 = n => String(n).padStart(2, '0');
export const r3 = n => Math.round((n + Number.EPSILON) * 1000) / 1000;
export const ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const todayStr = () => ymd(new Date());
export const ymOf = s => s.slice(0, 7);
export const daysIn = (y, m) => new Date(y, m, 0).getDate();
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${p2((t % 12) + 1)}`;
}
export function dateIn(ym, day) { const [y, m] = ym.split('-').map(Number); return `${ym}-${p2(Math.min(Math.max(1, day || 1), daysIn(y, m)))}`; }
export const monthStart = ym => `${ym}-01`;
export const monthEnd = ym => dateIn(ym, 31);
export function addDays(s, n) { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); }
export function monthsBetween(a, b) { const out = []; for (let m = a, i = 0; m <= b && i < 1200; m = addMonths(m, 1), i++) out.push(m); return out; }
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ───── العملات ─────
export function conv(amount, from, to, rates) {
  if (from === to) return amount;
  const a = rates?.[from], b = rates?.[to];
  if (!(a > 0) || !(b > 0)) return NaN;
  return (amount / a) * b;
}
// تحويل مبلغ عملية بسعر الصرف المحفوظ وقت تسجيلها؛ وإن لم يتوفر فبالسعر الحالي
export function convTx(tx, amount, from, to, S) {
  let v = conv(amount, from, to, tx.rates);
  if (Number.isNaN(v)) v = conv(amount, from, to, S.rates);
  return Number.isNaN(v) ? 0 : v;
}
const cur$ = (amount, from, to, S) => { const v = conv(amount, from, to, S.rates); return Number.isNaN(v) ? 0 : v; };
export const isActual = t => t.status !== 'expected';

// ───── أرصدة الحسابات ─────
// الرصيد = الرصيد الافتتاحي + الداخل − الخارج. التحويلات تنقل المال ولا تُعد دخلاً ولا مصروفاً.
export function accountBalances(db, S, upto = null) {
  const bal = new Map(), cur = new Map();
  for (const a of db.accounts) {
    cur.set(a.id, a.currency);
    bal.set(a.id, upto && a.opening_date && a.opening_date > upto ? 0 : num(a.opening_balance));
  }
  const add = (id, amt, from, tx) => { if (bal.has(id)) bal.set(id, bal.get(id) + convTx(tx, amt, from, cur.get(id), S)); };
  for (const t of db.transactions) {
    if (!isActual(t) || (upto && t.date > upto)) continue;
    const a = num(t.amount);
    switch (t.kind) {
      case 'income': case 'debt_received': case 'jamiya_payout': case 'adjust': add(t.account_id, a, t.currency, t); break;
      case 'expense': case 'debt_payment': case 'jamiya_payment': add(t.account_id, -a, t.currency, t); break;
      case 'transfer': case 'goal_alloc': case 'goal_withdraw':
        if (t.account_id && t.to_account_id && t.account_id !== t.to_account_id) {
          add(t.account_id, -a, t.currency, t);
          if (t.to_amount != null && t.to_amount !== '' && bal.has(t.to_account_id)) bal.set(t.to_account_id, bal.get(t.to_account_id) + num(t.to_amount));
          else add(t.to_account_id, a, t.currency, t);
        }
        break;
    }
  }
  for (const [k, v] of bal) bal.set(k, r3(v));
  return bal;
}

// ───── التدفقات خلال فترة ─────
// صافي التدفق النقدي = الدخل الفعلي − المصروفات الفعلية − الالتزامات المدفوعة (أقساط/ديون + اشتراكات جمعيات)
// لا يدخل في الدخل: القروض المستلمة، مبالغ الجمعيات المستلمة، التحويلات، التسويات.
export function flows(db, S, from, to, cur) {
  const f = { income: 0, expense: 0, debtPaid: 0, jamiyaPaid: 0, jamiyaReceived: 0, debtReceived: 0, adjust: 0,
    expectedIncome: 0, byCat: new Map(), byIncomeType: new Map(), count: 0 };
  for (const t of db.transactions) {
    if (t.date < from || t.date > to) continue;
    const v = convTx(t, num(t.amount), t.currency, cur, S);
    if (!isActual(t)) { if (t.kind === 'income') f.expectedIncome += v; continue; }
    f.count++;
    switch (t.kind) {
      case 'income': f.income += v; f.byIncomeType.set(t.income_type || 'other', (f.byIncomeType.get(t.income_type || 'other') || 0) + v); break;
      case 'expense': f.expense += v; f.byCat.set(t.category_id || '', (f.byCat.get(t.category_id || '') || 0) + v); break;
      case 'debt_payment': f.debtPaid += v; break;
      case 'jamiya_payment': f.jamiyaPaid += v; break;
      case 'jamiya_payout': f.jamiyaReceived += v; break;
      case 'debt_received': f.debtReceived += v; break;
      case 'adjust': f.adjust += v; break;
    }
  }
  for (const k of ['income', 'expense', 'debtPaid', 'jamiyaPaid', 'jamiyaReceived', 'debtReceived', 'adjust', 'expectedIncome']) f[k] = r3(f[k]);
  f.obligations = r3(f.debtPaid + f.jamiyaPaid);
  f.net = r3(f.income - f.expense - f.obligations);
  f.savingsRate = f.income > 0 ? f.net / f.income : null;
  return f;
}

// ───── توزيع المدفوع على جدول الأقساط (الأقدم أولاً) ─────
function allocate(items, paid, today) {
  let left = paid;
  for (const it of items) {
    it.paidAmt = r3(Math.max(0, Math.min(it.amount, left))); left = r3(left - it.paidAmt);
    it.remaining = r3(it.amount - it.paidAmt);
    it.paid = it.remaining <= 0.005;
    it.status = it.paid ? 'paid' : dueStatus(it.due, today);
  }
  return items;
}
export function dueStatus(date, today) {
  if (date < today) return 'overdue';
  if (date === today) return 'today';
  if (date <= addDays(today, 3)) return 'd3';
  if (date <= addDays(today, 7)) return 'd7';
  return 'upcoming';
}
export const isSoon = s => s === 'today' || s === 'd3' || s === 'd7';

// ───── الديون والأقساط ─────
// المدفوع = المدفوع قبل التسجيل + مجموع الدفعات المسجلة (محوّلة لعملة الدين بسعر يوم الدفع)
// المتبقي = الإجمالي − المدفوع ؛ الأقساط المتبقية = عدد الأقساط غير المسددة بالكامل في الجدول
export function debtPaidTotal(d, db, S, upto = null) {
  let p = num(d.paid_before);
  for (const t of db.transactions) if (t.debt_id === d.id && t.kind === 'debt_payment' && isActual(t) && (!upto || t.date <= upto)) p += convTx(t, num(t.amount), t.currency, d.currency, S);
  return r3(p);
}
export function debtState(d, db, S, today) {
  const total = num(d.total), monthly = num(d.monthly);
  const paid = Math.min(debtPaidTotal(d, db, S), Math.max(total, 0));
  const remaining = r3(Math.max(0, total - paid));
  const day = d.due_day || Number((d.start_date || today).slice(8, 10));
  const start = d.start_date || today;
  let items = [];
  if (monthly > 0) {
    const n = Math.min(600, Math.ceil(total / monthly - 1e-9));
    for (let i = 0; i < n; i++) items.push({ n: i + 1, due: dateIn(addMonths(ymOf(start), i), day), amount: i === n - 1 ? r3(total - monthly * (n - 1)) : monthly });
  } else if (total > 0) items.push({ n: 1, due: d.end_date || start, amount: total });
  allocate(items, paid, today);
  const unpaid = items.filter(i => !i.paid);
  const next = unpaid[0] || null;
  const arrears = r3(unpaid.filter(i => i.status === 'overdue').reduce((s, i) => s + i.remaining, 0));
  let endDate = items.length ? items[items.length - 1].due : null;
  if (monthly > 0 && unpaid.length) { // النهاية المتوقعة بحسب ما تبقى فعلياً
    const base = next.due < today ? dateIn(ymOf(today), day) < today ? dateIn(addMonths(ymOf(today), 1), day) : dateIn(ymOf(today), day) : next.due;
    endDate = dateIn(addMonths(ymOf(base), unpaid.length - 1), day);
  }
  const status = remaining <= 0.005 ? 'done' : arrears > 0 ? 'overdue' : next && isSoon(next.status) ? 'soon' : 'ok';
  return { total, paid, remaining, monthly, schedule: items, remainingCount: unpaid.length, next, arrears, endDate, status, pct: total > 0 ? paid / total : 0 };
}

// ───── الجمعيات ─────
// مركزي في الجمعية = ما دفعته − ما استلمته. موجب: مبلغ مستحق لي. سالب: التزام عليّ (استلمت قبل إكمال الدفع).
// المبلغ المستلم ليس دخلاً، والاشتراك ليس مصروفاً استهلاكياً: كلاهما ادخار دوري.
export function jamiyaState(j, db, S, today, upto = null) {
  const monthly = num(j.monthly), months = j.months || j.members || 0;
  let paid = 0, received = 0;
  for (const t of db.transactions) {
    if (t.jamiya_id !== j.id || !isActual(t) || (upto && t.date > upto)) continue;
    const v = convTx(t, num(t.amount), t.currency, j.currency, S);
    if (t.kind === 'jamiya_payment') paid += v; else if (t.kind === 'jamiya_payout') received += v;
  }
  paid = r3(paid); received = r3(received);
  const receiveOnly = j.type === 'receive_only';
  const totalDue = receiveOnly ? 0 : r3(monthly * months);
  const expectedPayout = num(j.payout_amount) || r3(monthly * (j.members || months));
  const start = j.start_date || today, day = j.pay_day || Number(start.slice(8, 10));
  const items = [];
  if (!receiveOnly) for (let i = 0; i < Math.min(months, 600); i++) items.push({ n: i + 1, due: dateIn(addMonths(ymOf(start), i), day), amount: monthly });
  allocate(items, paid, today);
  const payoutDate = dateIn(addMonths(ymOf(start), Math.max(1, j.my_turn || 1) - 1), day);
  const gotPayout = received >= expectedPayout - 0.005;
  const unpaid = items.filter(i => !i.paid);
  const complete = (receiveOnly || !unpaid.length) && gotPayout;
  const status = j.status === 'cancelled' || j.status === 'paused' ? j.status : complete ? 'completed' : 'active';
  const position = status === 'cancelled' ? r3(paid - received) : receiveOnly ? r3(expectedPayout - received) : r3(paid - received);
  return { monthly, months, paid, received, totalDue, remainingDue: r3(Math.max(0, totalDue - paid)), expectedPayout, payoutDate, gotPayout,
    payoutStatus: gotPayout ? 'paid' : dueStatus(payoutDate, today), schedule: items, next: unpaid[0] || null,
    arrears: r3(unpaid.filter(i => i.status === 'overdue').reduce((s, i) => s + i.remaining, 0)), status, position, receiveOnly };
}

// ───── أهداف الادخار ─────
// المدّخر للهدف = مجموع التخصيصات − مجموع السحوبات (تخصيص وليس مصروفاً)
export function goalState(g, db, S, today) {
  let saved = 0; const byMonth = new Map();
  for (const t of db.transactions) {
    if (t.goal_id !== g.id || !isActual(t) || (t.kind !== 'goal_alloc' && t.kind !== 'goal_withdraw')) continue;
    const v = convTx(t, num(t.amount), t.currency, g.currency, S) * (t.kind === 'goal_alloc' ? 1 : -1);
    saved += v; byMonth.set(ymOf(t.date), (byMonth.get(ymOf(t.date)) || 0) + v);
  }
  saved = r3(saved);
  const target = num(g.target), remaining = r3(Math.max(0, target - saved));
  let pace = num(g.monthly_plan);
  if (!(pace > 0)) { let s = 0; for (let i = 1; i <= 3; i++) s += byMonth.get(addMonths(ymOf(today), -i)) || 0; pace = s / 3; }
  let eta = null;
  if (remaining <= 0) eta = today; else if (pace > 0) eta = monthEnd(addMonths(ymOf(today), Math.ceil(remaining / pace)));
  return { saved, target, remaining, pct: target > 0 ? Math.min(1, saved / target) : 0, pace: r3(pace), eta, done: target > 0 && remaining <= 0 };
}

// ───── الميزانية ─────
// ميزانية شهر معين = آخر قيمة سارية (effective_from ≤ الشهر). تغيير الميزانية لا يغيّر الشهور السابقة.
export function budgetFor(db, month) {
  const m = new Map();
  for (const b of db.budgets) {
    if (b.effective_from > month) continue;
    const c = m.get(b.category_id);
    if (!c || b.effective_from > c.effective_from) m.set(b.category_id, b);
  }
  for (const [k, b] of m) if (!(num(b.amount) > 0)) m.delete(k);
  return m;
}
export function budgetLevel(pct) { return pct > 1 ? 'red' : pct >= 0.9 ? 'orange' : pct >= 0.75 ? 'yellow' : 'green'; }
export function budgetStatus(db, S, month, cur) {
  const f = flows(db, S, monthStart(month), monthEnd(month), cur), bud = budgetFor(db, month), rows = [];
  const ids = new Set([...bud.keys(), ...f.byCat.keys()]);
  for (const id of ids) {
    const b = bud.get(id), budget = b ? r3(cur$(num(b.amount), b.currency, cur, S)) : 0, spent = r3(f.byCat.get(id) || 0);
    const pct = budget > 0 ? spent / budget : null;
    rows.push({ category_id: id, budget, spent, left: r3(budget - spent), pct, level: pct == null ? 'none' : budgetLevel(pct), row: b || null });
  }
  rows.sort((a, b) => (b.budget > 0) - (a.budget > 0) || b.spent - a.spent);
  const tb = r3(rows.reduce((s, r) => s + r.budget, 0)), ts = r3(rows.filter(r => r.budget > 0).reduce((s, r) => s + r.spent, 0));
  return { rows, totalBudget: tb, totalSpentBudgeted: ts, totalSpent: f.expense };
}

// ───── المواعيد (التقويم والتنبيهات) ─────
export function occurrences(db, S, from, to, today) {
  const ev = [];
  const paidRec = new Set(db.transactions.filter(t => t.recurring_id && isActual(t)).map(t => `${t.recurring_id}|${t.period}`));
  for (const r of db.recurring) {
    if (!r.active || !r.start_date) continue;
    const a = ymOf(r.start_date) > ymOf(from) ? ymOf(r.start_date) : ymOf(from);
    for (const m of monthsBetween(a, ymOf(to))) {
      const date = dateIn(m, r.day);
      if (date < from || date > to || date < r.start_date || (r.end_date && date > r.end_date)) continue;
      const paid = paidRec.has(`${r.id}|${m}`);
      ev.push({ date, type: r.kind === 'income' ? 'income' : 'expense', title: r.name, amount: num(r.amount), remaining: paid ? 0 : num(r.amount),
        currency: r.currency, paid, status: paid ? 'paid' : dueStatus(date, today), ref: { table: 'recurring', id: r.id, period: m } });
    }
  }
  for (const d of db.debts) {
    for (const i of debtState(d, db, S, today).schedule) if (i.due >= from && i.due <= to)
      ev.push({ date: i.due, type: 'debt', title: d.name, amount: i.amount, remaining: i.remaining, currency: d.currency, paid: i.paid, status: i.status, ref: { table: 'debts', id: d.id, n: i.n } });
  }
  for (const j of db.jamiyas) {
    const st = jamiyaState(j, db, S, today);
    if (st.status === 'cancelled' || st.status === 'paused') continue;
    for (const i of st.schedule) if (i.due >= from && i.due <= to)
      ev.push({ date: i.due, type: 'jamiya', title: j.name, amount: i.amount, remaining: i.remaining, currency: j.currency, paid: i.paid, status: i.status, ref: { table: 'jamiyas', id: j.id, n: i.n } });
    if (st.payoutDate >= from && st.payoutDate <= to)
      ev.push({ date: st.payoutDate, type: 'payout', title: `استلام ${j.name}`, amount: st.expectedPayout, remaining: r3(Math.max(0, st.expectedPayout - st.received)), currency: j.currency, paid: st.gotPayout, status: st.payoutStatus, ref: { table: 'jamiyas', id: j.id, payout: true } });
  }
  for (const t of db.transactions) if (!isActual(t) && t.kind === 'income' && t.date >= from && t.date <= to)
    ev.push({ date: t.date, type: 'income', title: t.description || 'دخل متوقع', amount: num(t.amount), remaining: num(t.amount), currency: t.currency, paid: false, status: dueStatus(t.date, today), ref: { table: 'transactions', id: t.id } });
  ev.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return ev;
}
export const isOutflow = e => e.type === 'expense' || e.type === 'debt' || e.type === 'jamiya';

// ───── المركز المالي في تاريخ معين (بأسعار الصرف الحالية) ─────
export function position(db, S, date, cur, today = date) {
  const bal = accountBalances(db, S, date), types = new Map(db.accounts.map(a => [a.id, a.type]));
  const p = { totalBalances: 0, invested: 0, savingsAccounts: 0, earmarked: 0, earmarkedOutside: 0, jamiyaReceivable: 0, jamiyaLiability: 0, debtsRemaining: 0 };
  for (const a of db.accounts) {
    const v = cur$(bal.get(a.id) || 0, a.currency, cur, S);
    p.totalBalances += v; if (a.type === 'investment') p.invested += v; if (a.type === 'savings') p.savingsAccounts += v;
  }
  let eInv = 0;
  for (const t of db.transactions) {
    if (!isActual(t) || t.date > date || !t.goal_id || (t.kind !== 'goal_alloc' && t.kind !== 'goal_withdraw')) continue;
    const sign = t.kind === 'goal_alloc' ? 1 : -1, v = cur$(num(t.amount), t.currency, cur, S) * sign;
    const held = types.get(t.kind === 'goal_alloc' ? (t.to_account_id || t.account_id) : t.account_id);
    p.earmarked += v;
    if (held === 'investment') eInv += v; else if (held !== 'savings') p.earmarkedOutside += v;
  }
  for (const j of db.jamiyas) {
    const v = cur$(jamiyaState(j, db, S, today, date).position, j.currency, cur, S);
    if (v > 0) p.jamiyaReceivable += v; else p.jamiyaLiability -= v;
  }
  for (const d of db.debts) {
    if ((d.start_date || '') > date && ymd(new Date(d.created_at || 0)) > date) continue;
    p.debtsRemaining += cur$(Math.max(0, num(d.total) - debtPaidTotal(d, db, S, date)), d.currency, cur, S);
  }
  // النقد المتاح = كل الأرصدة − المستثمر − المخصص لأهداف (غير الموجود أصلاً في حسابات الاستثمار)
  p.availableCash = p.totalBalances - p.invested - (p.earmarked - eInv);
  // إجمالي المدخرات = حسابات الادخار + الاستثمار + المخصص لأهداف داخل حسابات أخرى (بدون تكرار)
  p.totalSavings = p.savingsAccounts + p.invested + p.earmarkedOutside;
  p.netWorth = p.totalBalances + p.jamiyaReceivable - p.jamiyaLiability - p.debtsRemaining;
  for (const k in p) p[k] = r3(p[k]);
  return p;
}

// ───── لوحة الشهر ─────
export function dashboard(db, S, today, cur, month = ymOf(today)) {
  const a = monthStart(month), b = monthEnd(month);
  const f = flows(db, S, a, b, cur);
  const occ = occurrences(db, S, '1900-01-01', b, today);
  const due = { total: 0, remaining: 0, recurringRemaining: 0, expectedRecurringIncome: 0 };
  for (const e of occ) {
    const inMonth = e.date >= a, v = cur$(e.amount, e.currency, cur, S), rem = cur$(e.remaining, e.currency, cur, S);
    if (e.type === 'debt' || e.type === 'jamiya') { if (inMonth || !e.paid) { due.total += inMonth ? v : rem; due.remaining += rem; } }
    else if (e.type === 'expense') { if (!e.paid) due.recurringRemaining += rem; }
    else if (e.type === 'income' && e.ref.table === 'recurring' && inMonth && !e.paid) due.expectedRecurringIncome += rem;
  }
  for (const k in due) due[k] = r3(due[k]);
  const pos = position(db, S, today, cur);
  const expectedIncome = r3(f.expectedIncome + due.expectedRecurringIncome);
  const incomeRef = f.income > 0 ? f.income : expectedIncome;
  return { month, flows: f, due, pos, expectedIncome,
    availableToSpend: r3(pos.availableCash - due.remaining - due.recurringRemaining),
    obligationsRatio: incomeRef > 0 ? due.total / incomeRef : null,
    alerts: occ.filter(e => !e.paid && (e.status === 'overdue' || isSoon(e.status))) };
}

// ───── تقرير فترة / سنة ─────
export function report(db, S, from, to, cur, today) {
  const f = flows(db, S, from, to, cur);
  const firstTx = db.transactions.reduce((m, t) => (t.date < m ? t.date : m), today);
  const effFrom = from < firstTx ? firstTx : from, effTo = to > today ? today : to;
  const months = monthsBetween(ymOf(from < firstTx ? firstTx : from), ymOf(to)).map(m => {
    const a = monthStart(m) < from ? from : monthStart(m), b = monthEnd(m) > to ? to : monthEnd(m);
    const mf = flows(db, S, a, b, cur), future = a > today;
    const pos = future ? null : position(db, S, b > today ? today : b, cur, today);
    return { month: m, future, income: mf.income, expense: mf.expense, obligations: mf.obligations, debtPaid: mf.debtPaid, jamiyaPaid: mf.jamiyaPaid, net: mf.net,
      savings: pos?.totalSavings ?? null, balances: pos?.totalBalances ?? null, debts: pos?.debtsRemaining ?? null, netWorth: pos?.netWorth ?? null };
  });
  let cum = 0; for (const m of months) { cum = r3(cum + m.net); m.cumNet = m.future ? null : cum; }
  const elapsed = months.filter(m => !m.future);
  const withExp = elapsed.filter(m => m.expense > 0);
  const maxM = withExp.reduce((x, m) => (!x || m.expense > x.expense ? m : x), null);
  const minM = withExp.reduce((x, m) => (!x || m.expense < x.expense ? m : x), null);
  const settled = [];
  for (const d of db.debts) {
    const pays = db.transactions.filter(t => t.debt_id === d.id && t.kind === 'debt_payment' && isActual(t)).map(t => t.date).sort();
    const last = pays[pays.length - 1];
    if (last && last >= from && last <= to && num(d.total) - debtPaidTotal(d, db, S) <= 0.005) settled.push({ name: d.name, amount: r3(cur$(num(d.total), d.currency, cur, S)) });
  }
  const perCurrency = new Map();
  for (const t of db.transactions) {
    if (!isActual(t) || t.date < from || t.date > to) continue;
    const k = { income: 'income', expense: 'expense', debt_payment: 'obligations', jamiya_payment: 'obligations' }[t.kind];
    if (!k) continue;
    const o = perCurrency.get(t.currency) || { income: 0, expense: 0, obligations: 0 };
    o[k] = r3(o[k] + num(t.amount)); perCurrency.set(t.currency, o);
  }
  const endPos = position(db, S, effTo < effFrom ? today : effTo, cur, today);
  return { from, to, flows: f, months, maxMonth: maxM, minMonth: minM,
    avgMonthlyExpense: elapsed.length ? r3(f.expense / elapsed.length) : 0, monthsCount: elapsed.length,
    settled, settledTotal: r3(settled.reduce((s, x) => s + x.amount, 0)), perCurrency, endPos };
}
export function yearsCompare(db, S, cur, today) {
  const years = new Set(db.transactions.map(t => t.date.slice(0, 4))); years.add(today.slice(0, 4));
  return [...years].sort().map(y => { const f = flows(db, S, `${y}-01-01`, `${y}-12-31`, cur); return { year: y, income: f.income, expense: f.expense, net: f.net, savingsRate: f.savingsRate }; });
}

// ───── فروق أسعار الصرف ─────
// للحسابات بغير عملة العرض: القيمة الحالية (بسعر اليوم) − القيمة الدفترية (كل حركة بسعر يومها)
export function fxDifference(db, S, cur) {
  const bal = accountBalances(db, S); let current = 0, book = 0;
  const acc = new Map(db.accounts.filter(a => a.currency !== cur).map(a => [a.id, a]));
  for (const a of acc.values()) { current += cur$(bal.get(a.id) || 0, a.currency, cur, S); book += cur$(num(a.opening_balance), a.currency, cur, S); }
  const mv = (id, amt, from, t) => { if (acc.has(id)) book += convTx(t, amt, from, cur, S); };
  for (const t of db.transactions) {
    if (!isActual(t)) continue; const a = num(t.amount);
    if (['income', 'debt_received', 'jamiya_payout', 'adjust'].includes(t.kind)) mv(t.account_id, a, t.currency, t);
    else if (['expense', 'debt_payment', 'jamiya_payment'].includes(t.kind)) mv(t.account_id, -a, t.currency, t);
    else if (t.account_id && t.to_account_id && t.account_id !== t.to_account_id) {
      mv(t.account_id, -a, t.currency, t);
      if (t.to_amount != null && t.to_amount !== '' && acc.has(t.to_account_id)) book += convTx(t, num(t.to_amount), acc.get(t.to_account_id).currency, cur, S);
      else mv(t.to_account_id, a, t.currency, t);
    }
  }
  return { current: r3(current), book: r3(book), diff: r3(current - book) };
}
