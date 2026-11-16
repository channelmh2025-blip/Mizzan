import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/calc.js';

const R = { USD: 1, SAR: 3.75, EGP: 50 };
const S = { base_currency: 'SAR', display_currency: 'SAR', rates: R };
let n = 0;
const tx = (kind, date, amount, o = {}) => ({ id: 't' + (++n), kind, date, amount, currency: 'SAR', status: 'actual', rates: R, account_id: 'bank', ...o });
function scenario() {
  return {
    accounts: [
      { id: 'cash', type: 'cash', currency: 'SAR', opening_balance: 1000, opening_date: '2026-01-01' },
      { id: 'bank', type: 'bank', currency: 'SAR', opening_balance: 5000, opening_date: '2026-01-01' },
      { id: 'sav', type: 'savings', currency: 'SAR', opening_balance: 0, opening_date: '2026-01-01' },
      { id: 'usd', type: 'wallet', currency: 'USD', opening_balance: 100, opening_date: '2026-01-01' },
    ],
    categories: [{ id: 'food' }, { id: 'rent' }],
    debts: [{ id: 'd1', name: 'قرض', currency: 'SAR', total: 12000, paid_before: 0, monthly: 1000, start_date: '2026-02-25', due_day: 25, created_at: '2026-02-10T00:00:00Z' }],
    jamiyas: [{ id: 'j1', name: 'جمعية', type: 'paying', currency: 'SAR', monthly: 500, members: 10, months: 10, start_date: '2026-01-15', pay_day: 15, my_turn: 2 }],
    goals: [{ id: 'g1', currency: 'SAR', target: 6000, monthly_plan: 500 }],
    recurring: [],
    budgets: [{ id: 'b1', category_id: 'rent', amount: 2500, currency: 'SAR', effective_from: '2026-01' }, { id: 'b2', category_id: 'rent', amount: 4000, currency: 'SAR', effective_from: '2026-03' }],
    transactions: [
      tx('income', '2026-01-01', 10000, { income_type: 'salary' }),
      tx('expense', '2026-01-05', 2000, { category_id: 'food' }),
      tx('transfer', '2026-01-10', 1500, { to_account_id: 'sav' }),
      tx('jamiya_payment', '2026-01-15', 500, { jamiya_id: 'j1' }),
      tx('income', '2026-02-01', 10000, { income_type: 'salary' }),
      tx('expense', '2026-02-03', 3000, { category_id: 'rent' }),
      tx('debt_received', '2026-02-10', 12000, { debt_id: 'd1' }),
      tx('jamiya_payment', '2026-02-15', 500, { jamiya_id: 'j1' }),
      tx('jamiya_payout', '2026-02-15', 5000, { jamiya_id: 'j1' }),
      tx('debt_payment', '2026-02-25', 1000, { debt_id: 'd1' }),
      tx('income', '2026-03-01', 10000, { income_type: 'salary' }),
      tx('expense', '2026-03-02', 100, { currency: 'USD', account_id: 'usd', category_id: 'food' }),
      tx('goal_alloc', '2026-03-05', 1000, { to_account_id: 'sav', goal_id: 'g1' }),
      tx('goal_alloc', '2026-03-06', 500, { goal_id: 'g1' }),
      tx('income', '2026-03-28', 2000, { status: 'expected' }),
    ],
  };
}
const TODAY = '2026-03-20';

test('أرصدة الحسابات: التحويل لا يغيّر الإجمالي والمتوقع لا يُحتسب', () => {
  const b = C.accountBalances(scenario(), S);
  assert.equal(b.get('cash'), 1000); assert.equal(b.get('bank'), 42500);
  assert.equal(b.get('sav'), 2500); assert.equal(b.get('usd'), 0);
  assert.equal(C.accountBalances(scenario(), S, '2026-01-31').get('bank'), 5000 + 10000 - 2000 - 1500 - 500);
});

test('التدفقات: القرض والجمعية المستلمة والتحويل ليست دخلاً ولا مصروفاً', () => {
  const f = C.flows(scenario(), S, '2026-01-01', '2026-03-31', 'SAR');
  assert.equal(f.income, 30000); assert.equal(f.expense, 5375);
  assert.equal(f.debtPaid, 1000); assert.equal(f.jamiyaPaid, 1000);
  assert.equal(f.obligations, 2000); assert.equal(f.net, 22625);
  assert.equal(f.jamiyaReceived, 5000); assert.equal(f.debtReceived, 12000);
  assert.equal(f.expectedIncome, 2000);
  assert.ok(Math.abs(f.savingsRate - 22625 / 30000) < 1e-9);
});

test('مطابقة: تغيّر الأرصدة = صافي التدفق + الجمعيات المستلمة + القروض المستلمة', () => {
  const db = scenario(), b = C.accountBalances(db, S), f = C.flows(db, S, '2026-01-01', '2026-12-31', 'SAR');
  const now = 1000 + b.get('bank') + b.get('sav') + b.get('usd') * 3.75, open = 1000 + 5000 + 0 + 375;
  assert.equal(C.r3(now - open), C.r3(f.net + f.jamiyaReceived + f.debtReceived + f.adjust));
});

test('الدين: المتبقي والأقساط والحالة (مستحق خلال 7 أيام ثم متأخر) والسداد المبكر', () => {
  const db = scenario(), d = db.debts[0];
  let s = C.debtState(d, db, S, TODAY);
  assert.equal(s.paid, 1000); assert.equal(s.remaining, 11000); assert.equal(s.remainingCount, 11);
  assert.equal(s.schedule.length, 12); assert.equal(s.next.due, '2026-03-25'); assert.equal(s.status, 'soon');
  assert.equal(s.endDate, '2027-01-25');
  s = C.debtState(d, db, S, '2026-03-27');
  assert.equal(s.status, 'overdue'); assert.equal(s.arrears, 1000);
  db.transactions.push(tx('debt_payment', '2026-03-19', 2500, { debt_id: 'd1' })); // سداد مبكر + جزئي
  s = C.debtState(d, db, S, TODAY);
  assert.equal(s.remaining, 8500); assert.equal(s.next.n, 4); assert.equal(s.next.remaining, 500); assert.equal(s.status, 'ok');
  db.transactions.push(tx('debt_payment', '2026-03-20', 8500, { debt_id: 'd1' }));
  assert.equal(C.debtState(d, db, S, TODAY).status, 'done');
});

test('دين بقسط أخير مختلف ومدفوع قبل التسجيل', () => {
  const d = { id: 'x', currency: 'SAR', total: 2500, paid_before: 1000, monthly: 1000, start_date: '2026-01-31', due_day: 31 };
  const s = C.debtState(d, { transactions: [] }, S, '2026-02-10');
  assert.deepEqual(s.schedule.map(i => [i.due, i.amount, i.paid]), [['2026-01-31', 1000, true], ['2026-02-28', 1000, false], ['2026-03-31', 500, false]]);
  assert.equal(s.remaining, 1500); assert.equal(s.status, 'ok');
});

test('الجمعية: المدفوع والمستلم والمركز والمتأخر', () => {
  const db = scenario(), s = C.jamiyaState(db.jamiyas[0], db, S, TODAY);
  assert.equal(s.paid, 1000); assert.equal(s.received, 5000); assert.equal(s.expectedPayout, 5000);
  assert.equal(s.payoutDate, '2026-02-15'); assert.equal(s.gotPayout, true);
  assert.equal(s.position, -4000); assert.equal(s.remainingDue, 4000);
  assert.equal(s.next.due, '2026-03-15'); assert.equal(s.arrears, 500); assert.equal(s.status, 'active');
});

test('المركز المالي: الجمعية والقرض لا يغيّران صافي الثروة', () => {
  const p = C.position(scenario(), S, TODAY, 'SAR');
  assert.equal(p.totalBalances, 46000); assert.equal(p.savingsAccounts, 2500);
  assert.equal(p.earmarked, 1500); assert.equal(p.earmarkedOutside, 500); assert.equal(p.totalSavings, 3000);
  assert.equal(p.availableCash, 44500); assert.equal(p.jamiyaLiability, 4000); assert.equal(p.debtsRemaining, 11000);
  assert.equal(p.netWorth, 31000); // = 6375 افتتاحي + 30000 دخل − 5375 مصروف
});

test('الهدف: التخصيص ليس مصروفاً', () => {
  const db = scenario(), g = C.goalState(db.goals[0], db, S, TODAY);
  assert.equal(g.saved, 1500); assert.equal(g.remaining, 4500); assert.equal(g.eta, '2026-12-31');
  assert.equal(C.flows(db, S, '2026-03-01', '2026-03-31', 'SAR').expense, 375);
});

test('الميزانية: المستويات اللونية وعدم تأثر الشهور السابقة بتغيير الميزانية', () => {
  const db = scenario();
  const feb = C.budgetStatus(db, S, '2026-02', 'SAR').rows.find(r => r.category_id === 'rent');
  assert.equal(feb.budget, 2500); assert.equal(feb.spent, 3000); assert.equal(feb.level, 'red');
  assert.equal(C.budgetFor(db, '2026-03').get('rent').amount, 4000);
  assert.deepEqual([0.5, 0.75, 0.9, 1, 1.01].map(C.budgetLevel), ['green', 'yellow', 'orange', 'orange', 'red']);
});

test('العملات: العمليات القديمة تحتفظ بسعر يومها عند تغيّر السعر أو العملة الأساسية', () => {
  const db = scenario(), S2 = { ...S, rates: { USD: 1, SAR: 4, EGP: 60 } };
  assert.equal(C.flows(db, S2, '2026-03-01', '2026-03-31', 'SAR').expense, 375);       // سعر اليوم القديم 3.75
  assert.equal(C.flows(db, S2, '2026-03-01', '2026-03-31', 'EGP').expense, 5000);      // 100$ × 50 وقت العملية
  assert.equal(C.flows(db, S2, '2026-01-01', '2026-01-31', 'USD').income, C.r3(10000 / 3.75));
  db.accounts[3].opening_balance = 200; // بقي 100$ في المحفظة
  const fx = C.fxDifference(db, S2, 'SAR');
  assert.equal(fx.current, 400); assert.equal(fx.book, 800 - 375); assert.equal(fx.diff, -25);
});

test('لوحة الشهر: المستحق والمتاح للإنفاق والتنبيهات', () => {
  const d = C.dashboard(scenario(), S, TODAY, 'SAR');
  assert.equal(d.flows.income, 10000); assert.equal(d.due.total, 1500); assert.equal(d.due.remaining, 1500);
  assert.equal(d.expectedIncome, 2000); assert.equal(d.availableToSpend, 43000);
  assert.equal(d.obligationsRatio, 0.15);
  assert.deepEqual(d.alerts.map(a => [a.type, a.status]), [['jamiya', 'overdue'], ['debt', 'd7']]);
});

test('المتكرر: يظهر مستحقاً ثم مدفوعاً بعد تسجيله، دون تكرار', () => {
  const db = scenario();
  db.recurring.push({ id: 'r1', kind: 'expense', name: 'إيجار', amount: 3000, currency: 'SAR', day: 31, start_date: '2026-02-01', active: true });
  let ev = C.occurrences(db, S, '2026-02-01', '2026-03-31', TODAY).filter(e => e.ref.id === 'r1');
  assert.deepEqual(ev.map(e => [e.date, e.status]), [['2026-02-28', 'overdue'], ['2026-03-31', 'upcoming']]);
  db.transactions.push(tx('expense', '2026-02-28', 3000, { recurring_id: 'r1', period: '2026-02' }));
  ev = C.occurrences(db, S, '2026-02-01', '2026-03-31', TODAY).filter(e => e.ref.id === 'r1');
  assert.equal(ev[0].paid, true);
  assert.equal(C.dashboard(db, S, TODAY, 'SAR').due.recurringRemaining, 3000);
});

test('التقرير السنوي: الشهور والتراكمي وأعلى/أقل شهر والسنة الجديدة لا تمسح القديم', () => {
  const db = scenario(), r = C.report(db, S, '2026-01-01', '2026-12-31', 'SAR', TODAY);
  assert.equal(r.months.length, 12); assert.equal(r.monthsCount, 3);
  assert.equal(r.maxMonth.month, '2026-02'); assert.equal(r.minMonth.month, '2026-03');
  assert.equal(r.avgMonthlyExpense, C.r3(5375 / 3));
  assert.deepEqual(r.months.slice(0, 3).map(m => m.cumNet), [7500, 13000, 22625]);
  assert.equal(r.months[1].debts, 11000); assert.equal(r.months[0].debts, 0); assert.equal(r.months[3].cumNet, null);
  assert.equal(r.perCurrency.get('USD').expense, 100);
  db.transactions.push(tx('income', '2027-01-01', 9000));
  const y = C.yearsCompare(db, S, 'SAR', '2027-01-02');
  assert.deepEqual(y.map(v => [v.year, v.net]), [['2026', 22625], ['2027', 9000]]);
  assert.equal(C.flows(db, S, '1900-01-01', '2999-12-31', 'SAR').income, 39000);
});
