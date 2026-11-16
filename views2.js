// الصفحات: الأقساط والديون، الجمعيات، الميزانية، الادخار، التقويم
import * as St from './store.js';
import * as C from './calc.js';
import { $, esc, money, moneyT, pct, fmtDate, fmtMonth, DAYS, openForm, openSheet, toast, confirmBox, on, empty, bar } from './ui.js';
import { app, D, dcur, today, accOptions, accounts, categories, catOf, curOptions, convNow, txList, txForm, eventRow, kv, STATUS, payOccurrence } from './tx.js';
import { DEBT_KINDS, GOAL_TYPES } from './schema.js';
import { monthNav, stat, curMonth } from './views1.js';

const schedTable = (items, cur) => `<div class="table-wrap"><table class="sched"><thead><tr><th>#</th><th>الاستحقاق</th><th>القسط</th><th>المدفوع</th><th>الحالة</th></tr></thead><tbody>${items.map(i => {
  const [l, c] = STATUS[i.status] || STATUS.upcoming; return `<tr class="${c}"><td>${i.n}</td><td>${fmtDate(i.due)}</td><td>${moneyT(i.amount, cur)}</td><td>${moneyT(i.paidAmt, cur)}</td><td><em class="badge ${c}">${i.paid ? 'مدفوع' : i.paidAmt > 0 ? `${l} · جزئي` : l}</em></td></tr>`; }).join('')}</tbody></table></div>`;

// ───── الأقساط والديون ─────
const DST = { done: ['مسدد بالكامل', 'green'], overdue: ['متأخر', 'red'], soon: ['مستحق', 'orange'], ok: ['مدفوع حتى تاريخه', 'gray'] };
export function debts() {
  const db = D(), S = St.S(), t = today();
  const rows = db.debts.map(d => ({ d, s: C.debtState(d, db, S, t) })).sort((a, b) => (a.s.status === 'done') - (b.s.status === 'done') || (a.s.next?.due || '9').localeCompare(b.s.next?.due || '9'));
  const act = rows.filter(r => r.s.status !== 'done');
  const sum = k => act.reduce((x, r) => x + convNow(k(r), r.d.currency), 0);
  const upcoming = C.occurrences(db, S, '1900-01-01', C.addDays(t, 60), t).filter(e => e.type === 'debt' && !e.paid);
  return `<section class="stats">${stat('إجمالي المتبقي', money(sum(r => r.s.remaining)), `${act.length} التزام نشط`)}${stat('الأقساط الشهرية', money(sum(r => Math.min(r.s.monthly, r.s.remaining))))}
    ${stat('متأخرات', money(sum(r => r.s.arrears)), '', sum(r => r.s.arrears) > 0 ? 'neg' : '')}${stat('إجمالي ما سُدِّد', money(rows.reduce((x, r) => x + convNow(r.s.paid, r.d.currency), 0)))}</section>
  <div class="actions"><button class="btn primary grow" data-a="debt-edit">＋ دين أو قسط جديد</button></div>
  ${rows.length ? rows.map(({ d, s }) => { const [l, c] = DST[s.status]; return `<button class="card item ${c}" data-a="debt-open" data-id="${d.id}">
      <div class="item-h"><div><b>${esc(d.name)}</b><small>${esc(d.creditor || DEBT_KINDS[d.kind] || '')}</small></div><em class="badge ${c}">${l}</em></div>
      ${bar(s.pct, s.status === 'overdue' ? 'red' : 'green')}
      <div class="item-f"><span>المتبقي <b>${money(s.remaining, d.currency)}</b></span><span>من ${moneyT(s.total, d.currency)}</span></div>
      ${s.status !== 'done' ? `<div class="item-f"><span>القسط ${s.monthly ? moneyT(s.monthly, d.currency) : '—'} · باقي ${s.remainingCount} قسط</span><span>${s.next ? `القادم ${fmtDate(s.next.due)}` : ''}</span></div>` : ''}</button>`; }).join('') : `<section class="card">${empty('لا توجد ديون أو أقساط مسجلة')}</section>`}
  ${upcoming.length ? `<section class="card"><h3>جدول الاستحقاقات القادمة (60 يوماً)</h3>${upcoming.map(eventRow).join('')}</section>` : ''}`;
}
function debtOpen(id) {
  const d = St.get('debts', id); if (!d) return; const s = C.debtState(d, D(), St.S(), today()), [l, c] = DST[s.status];
  const pays = D().transactions.filter(t => t.debt_id === id);
  openSheet(d.name, `<div class="kvs">${kv('الحالة', `<em class="badge ${c}">${l}</em>`)}${kv('الجهة المستحق لها', esc(d.creditor || '—'))}${kv('إجمالي المبلغ', money(s.total, d.currency))}${kv('المدفوع', money(s.paid, d.currency))}
    ${kv('المتبقي', money(s.remaining, d.currency))}${kv('القسط الشهري', s.monthly ? money(s.monthly, d.currency) : '—')}${kv('الأقساط المتبقية', s.remainingCount)}${kv('تاريخ البداية', fmtDate(d.start_date))}
    ${kv('الاستحقاق القادم', s.next ? fmtDate(s.next.due) : '—')}${kv('النهاية المتوقعة', fmtDate(s.endDate))}${s.arrears ? kv('متأخرات', money(s.arrears, d.currency), 'red') : ''}</div>${bar(s.pct)}
    <div class="actions">${s.status !== 'done' ? `<button class="btn primary" data-a="debt-pay" data-id="${id}">تسجيل دفعة</button>` : ''}<button class="btn" data-a="debt-edit" data-id="${id}">تعديل</button></div>
    <p class="hint">يمكنك دفع أي مبلغ: سداد جزئي، أو أكثر من قسط (سداد مبكر). يوزَّع المدفوع على الأقساط الأقدم أولاً.</p>
    <h3 class="sub">جدول الأقساط</h3>${schedTable(s.schedule, d.currency)}<h3 class="sub">الدفعات المسجلة</h3>${txList(pays, { group: false, showDate: true })}`, { wide: true });
}
on('debt-open', d => debtOpen(d.id));
on('debt-pay', d => payOccurrence({ table: 'debts', id: d.id }, () => debtOpen(d.id)));
on('debt-edit', d => {
  const o = d.id ? St.get('debts', d.id) : null;
  openForm({ title: o ? 'تعديل الدين / القسط' : 'دين أو قسط جديد', values: o || { kind: 'installment', currency: St.S().base_currency, start_date: today(), paid_before: 0 },
    fields: [{ name: 'name', label: 'اسم الدين أو القسط', required: true, placeholder: 'مثال: قسط السيارة', focus: !o }, { name: 'creditor', label: 'الجهة أو الشخص المستحق له', placeholder: 'مثال: البنك الأهلي' },
      { name: 'kind', label: 'النوع', type: 'select', options: Object.entries(DEBT_KINDS), required: true, half: true }, { name: 'currency', label: 'العملة', type: 'select', options: curOptions(), required: true, half: true },
      { name: 'total', label: 'إجمالي المبلغ', type: 'number', required: true, half: true, hint: 'شاملاً الأرباح/الفوائد إن وجدت.' }, { name: 'paid_before', label: 'المدفوع قبل التسجيل', type: 'number', half: true, hint: 'ما سددته قبل بدء استخدام التطبيق.' },
      { name: 'monthly', label: 'قيمة القسط الشهري', type: 'number', half: true, hint: 'اتركه فارغاً لدين يُسدد دفعة واحدة.' }, { name: 'start_date', label: 'تاريخ أول قسط', type: 'date', required: true, half: true },
      { name: 'due_day', label: 'يوم الاستحقاق الشهري', type: 'int', half: true, hint: 'من 1 إلى 31. الافتراضي: يوم أول قسط.', validate: v => (v !== '' && (v < 1 || v > 31) ? 'من 1 إلى 31' : '') },
      { name: 'end_date', label: 'تاريخ الاستحقاق', type: 'date', half: true, show: v => !(v.monthly > 0) },
      { name: 'received', label: 'استلام المبلغ', type: 'toggle', text: 'استلمتُ مبلغ القرض نقداً (يضاف للحساب دون احتسابه دخلاً)', show: v => !o && v.kind !== 'installment' },
      { name: 'recv_account', label: 'أُودع في حساب', type: 'select', options: accOptions(), show: v => !o && v.kind !== 'installment' && v.received }, { name: 'notes', label: 'ملاحظات', type: 'textarea' }],
    onSubmit: v => {
      if ((v.paid_before || 0) > v.total) { toast('المدفوع أكبر من الإجمالي', 'bad'); return false; }
      const { received, recv_account, ...row } = v;
      const saved = St.put('debts', { ...(o || {}), ...row, paid_before: v.paid_before || 0, due_day: v.due_day || Number(v.start_date.slice(8, 10)) });
      if (!o && received && recv_account) St.put('transactions', { kind: 'debt_received', status: 'actual', date: today(), amount: v.total - (v.paid_before || 0), currency: v.currency, account_id: recv_account, debt_id: saved.id, rates: { ...St.S().rates } });
      toast('تم الحفظ');
    },
    onDelete: o ? async () => { if (!(await confirmBox(`حذف «${o.name}»؟ الدفعات المسجلة ستبقى في السجل كعمليات سداد.`, { ok: 'حذف', danger: true }))) return false; St.remove('debts', o.id); } : null,
    onClose: o ? () => debtOpen(o.id) : null });
});

// ───── الجمعيات ─────
const JST = { active: ['نشطة', 'green'], completed: ['مكتملة', 'gray'], paused: ['متوقفة', 'orange'], cancelled: ['ملغاة', 'gray'] };
export function jamiyas() {
  const db = D(), S = St.S(), t = today();
  const rows = db.jamiyas.map(j => ({ j, s: C.jamiyaState(j, db, S, t) })).sort((a, b) => (a.s.status !== 'active') - (b.s.status !== 'active'));
  const act = rows.filter(r => r.s.status === 'active'), sum = (list, k) => list.reduce((x, r) => x + convNow(k(r), r.j.currency), 0);
  return `<section class="stats">${stat('الاشتراكات الشهرية', money(sum(act.filter(r => !r.s.receiveOnly && r.s.next), r => r.s.monthly)), `${act.length} جمعية نشطة`)}${stat('إجمالي ما دفعته', money(sum(rows, r => r.s.paid)))}
    ${stat('المتبقي عليّ دفعه', money(sum(act, r => r.s.remainingDue)))}${stat('مستحق لي من الجمعيات', money(sum(act, r => Math.max(0, r.s.position))), sum(act, r => Math.max(0, -r.s.position)) ? `والتزام عليّ: ${moneyT(sum(act, r => Math.max(0, -r.s.position)))}` : '')}</section>
  <div class="actions"><button class="btn primary grow" data-a="jam-edit">＋ جمعية جديدة</button></div>
  ${rows.length ? rows.map(({ j, s }) => { const [l, c] = JST[s.status]; return `<button class="card item" data-a="jam-open" data-id="${j.id}">
      <div class="item-h"><div><b>${esc(j.name)}</b><small>${s.receiveOnly ? 'استلام مبلغ' : `${moneyT(s.monthly, j.currency)} شهرياً · ${j.members || '—'} مشترك`}</small></div><em class="badge ${s.arrears ? 'red' : c}">${s.arrears ? 'اشتراك متأخر' : l}</em></div>
      ${s.receiveOnly ? '' : bar(s.totalDue ? s.paid / s.totalDue : 0)}
      <div class="item-f">${s.receiveOnly ? '' : `<span>دفعت <b>${money(s.paid, j.currency)}</b> من ${moneyT(s.totalDue, j.currency)}</span>`}<span>${s.gotPayout ? `استلمت ${moneyT(s.received, j.currency)} ✓` : `دوري ${j.my_turn || 1} · الاستلام ${fmtMonth(C.ymOf(s.payoutDate))}`}</span></div></button>`; }).join('') : `<section class="card">${empty('لا توجد جمعيات مسجلة')}</section>`}
  <p class="hint">الاشتراك في الجمعية ادخار دوري وليس مصروفاً استهلاكياً، والمبلغ المستلم ليس دخلاً جديداً؛ لذلك لا يغيّران صافي ثروتك.</p>`;
}
function jamOpen(id) {
  const j = St.get('jamiyas', id); if (!j) return; const s = C.jamiyaState(j, D(), St.S(), today()), [l, c] = JST[s.status];
  const txs = D().transactions.filter(t => t.jamiya_id === id);
  openSheet(j.name, `<div class="kvs">${kv('حالة الاشتراك', `<em class="badge ${c}">${l}</em>`)}${s.receiveOnly ? '' : kv('إجمالي قيمة الجمعية', money(s.totalDue, j.currency)) + kv('الاشتراك الشهري', money(s.monthly, j.currency)) + kv('عدد المشتركين', j.members || '—') + kv('عدد الشهور', s.months)}
    ${kv('تاريخ البداية', fmtDate(j.start_date))}${kv('يوم الدفع', j.pay_day || '—')}${kv('ترتيب دوري', j.my_turn || 1)}${kv('شهر الاستلام المتوقع', fmtMonth(C.ymOf(s.payoutDate)))}${kv('المبلغ المتوقع استلامه', money(s.expectedPayout, j.currency))}
    ${s.receiveOnly ? '' : kv('دفعت حتى الآن', money(s.paid, j.currency)) + kv('المتبقي عليّ', money(s.remainingDue, j.currency))}${kv('استلمت فعلياً', money(s.received, j.currency))}
    ${kv(s.position >= 0 ? 'مستحق لي' : 'التزام عليّ', money(Math.abs(s.position), j.currency), s.position < 0 ? 'red' : '')}</div>
    <div class="actions">${!s.receiveOnly && s.next ? `<button class="btn primary" data-a="jam-pay" data-id="${id}">دفع اشتراك</button>` : ''}${!s.gotPayout ? `<button class="btn" data-a="jam-pay" data-id="${id}" data-payout="1">تسجيل الاستلام</button>` : ''}<button class="btn" data-a="jam-edit" data-id="${id}">تعديل</button></div>
    ${s.receiveOnly ? '' : `<h3 class="sub">جدول الاشتراكات</h3>${schedTable(s.schedule, j.currency)}`}<h3 class="sub">العمليات المسجلة</h3>${txList(txs, { group: false, showDate: true })}`, { wide: true });
}
on('jam-open', d => jamOpen(d.id));
on('jam-pay', d => payOccurrence({ table: 'jamiyas', id: d.id, payout: d.payout === '1' }, () => jamOpen(d.id)));
on('jam-edit', d => {
  const o = d.id ? St.get('jamiyas', d.id) : null, paying = v => v.type !== 'receive_only';
  openForm({ title: o ? 'تعديل الجمعية' : 'جمعية جديدة', values: o ? { ...o, status: o.status || 'auto' } : { type: 'paying', currency: St.S().base_currency, start_date: today(), my_turn: 1, status: 'auto' },
    fields: [{ name: 'name', label: 'اسم الجمعية', required: true, placeholder: 'مثال: جمعية الأهل', focus: !o },
      { name: 'type', label: 'نوع المشاركة', type: 'seg', required: true, options: [['paying', 'أدفع اشتراكاً شهرياً'], ['receive_only', 'سأستلم مبلغاً في شهر محدد']] },
      { name: 'currency', label: 'العملة', type: 'select', options: curOptions(), required: true, half: true },
      { name: 'monthly', label: 'قيمة الاشتراك الشهري', type: 'number', half: true, show: paying, validate: (x, v) => (paying(v) && !(x > 0) ? 'مطلوب' : '') },
      { name: 'members', label: 'عدد المشتركين', type: 'int', half: true, show: paying, validate: (x, v) => (paying(v) && !(x > 0) ? 'مطلوب' : '') },
      { name: 'months', label: 'عدد الشهور', type: 'int', half: true, show: paying, hint: 'الافتراضي = عدد المشتركين.' },
      { name: 'start_date', label: 'تاريخ بداية الجمعية', type: 'date', required: true, half: true }, { name: 'pay_day', label: 'يوم دفع الاشتراك', type: 'int', half: true, validate: v => (v !== '' && (v < 1 || v > 31) ? 'من 1 إلى 31' : '') },
      { name: 'my_turn', label: 'ترتيب دوري في الاستلام', type: 'int', required: true, half: true, hint: 'شهر الاستلام = شهر البداية + الترتيب − 1.' },
      { name: 'payout_amount', label: 'المبلغ المتوقع استلامه', type: 'number', half: true, hint: 'الافتراضي = الاشتراك × عدد المشتركين.', validate: (x, v) => (!paying(v) && !(x > 0) ? 'مطلوب' : '') },
      { name: 'status', label: 'حالة الاشتراك', type: 'select', required: true, options: [['auto', 'تلقائي (نشطة ← مكتملة)'], ['paused', 'متوقفة مؤقتاً'], ['cancelled', 'ملغاة']] }, { name: 'notes', label: 'ملاحظات', type: 'textarea' }],
    onSubmit: v => { St.put('jamiyas', { ...(o || {}), ...v, status: v.status === 'auto' ? null : v.status, months: v.months || v.members || null, pay_day: v.pay_day || Number(v.start_date.slice(8, 10)) }); toast('تم الحفظ'); },
    onDelete: o ? async () => { if (!(await confirmBox(`حذف «${o.name}»؟ العمليات المسجلة ستبقى في السجل.`, { ok: 'حذف', danger: true }))) return false; St.remove('jamiyas', o.id); } : null,
    onClose: o ? () => jamOpen(o.id) : null });
});

// ───── الميزانية ─────
const LVL = { green: 'ضمن الميزانية', yellow: 'وصل 75%', orange: 'وصل 90%', red: 'تجاوز الميزانية', none: 'بدون ميزانية' };
export function budget() {
  const m = curMonth(), b = C.budgetStatus(D(), St.S(), m, dcur()), have = b.rows.filter(r => r.budget > 0), seen = new Set(b.rows.map(r => r.category_id));
  const rest = [...b.rows.filter(r => !(r.budget > 0)), ...categories().filter(c => !seen.has(c.id)).map(c => ({ category_id: c.id, spent: 0, budget: 0 }))];
  const tp = b.totalBudget ? b.totalSpentBudgeted / b.totalBudget : null;
  return `${monthNav()}<section class="hero"><span>ميزانية ${fmtMonth(m)}</span><strong>${money(b.totalSpentBudgeted)} <em>من ${moneyT(b.totalBudget)}</em></strong>
    ${bar(tp, tp == null ? 'green' : C.budgetLevel(tp))}<small>${b.totalBudget ? (b.totalBudget - b.totalSpentBudgeted >= 0 ? `متبقٍّ ${moneyT(b.totalBudget - b.totalSpentBudgeted)}` : `تجاوز بمقدار ${moneyT(b.totalSpentBudgeted - b.totalBudget)}`) : 'حدد ميزانية لكل تصنيف من القائمة أدناه'} · إجمالي مصروفات الشهر ${moneyT(b.totalSpent)}</small></section>
  <div class="legend wide"><span><i class="g"></i>أقل من 75%</span><span><i class="y"></i>75%</span><span><i class="o"></i>90%</span><span><i class="r"></i>تجاوز 100%</span></div>
  ${have.length ? `<section class="card">${have.map(r => `<button class="brow btn-row" data-a="bud-set" data-id="${r.category_id}"><div><span>${esc(catOf(r.category_id).icon || '')} ${esc(catOf(r.category_id).name)}</span><em class="badge ${r.level}">${pct(r.pct)} · ${LVL[r.level]}</em></div>
    ${bar(r.pct, r.level)}<div class="sm"><span>صُرف ${moneyT(r.spent)} من ${moneyT(r.budget)}</span><span>${r.left >= 0 ? `متبقٍّ ${moneyT(r.left)}` : `تجاوز ${moneyT(-r.left)}`}</span></div></button>`).join('')}</section>` : ''}
  <section class="card"><h3>تصنيفات بدون ميزانية</h3>${rest.length ? rest.map(r => `<button class="tx" data-a="bud-set" data-id="${r.category_id}"><span class="tx-ic neu">${esc(catOf(r.category_id).icon || '•')}</span><span class="tx-main"><b>${esc(catOf(r.category_id).name)}</b><small>صُرف ${moneyT(r.spent)}</small></span><span class="btn tiny">تحديد ميزانية</span></button>`).join('') : empty('كل التصنيفات لها ميزانية')}</section>`;
}
on('bud-set', d => {
  const m = curMonth(), cur = C.budgetFor(D(), m).get(d.id), exact = D().budgets.find(b => b.category_id === d.id && b.effective_from === m);
  openForm({ title: `ميزانية: ${catOf(d.id).name}`, intro: `<p class="hint">تسري من ${fmtMonth(m)} فصاعداً. الشهور السابقة تحتفظ بميزانيتها ولا تتغير.</p>`,
    values: { amount: cur?.amount ?? '', currency: cur?.currency || dcur() },
    fields: [{ name: 'amount', label: 'الميزانية الشهرية', type: 'number', required: true, allowZero: true, big: true, half: true, focus: true, hint: 'أدخل 0 لإلغاء الميزانية.' }, { name: 'currency', label: 'العملة', type: 'select', options: curOptions(), required: true, half: true }],
    onSubmit: v => { St.put('budgets', { ...(exact || {}), category_id: d.id, amount: v.amount, currency: v.currency, effective_from: m }); toast('تم حفظ الميزانية'); } });
});

// ───── الادخار ─────
export function savings() {
  const db = D(), S = St.S(), cur = dcur(), t = today(), p = C.position(db, S, t, cur), m = C.ymOf(t);
  const f = C.flows(db, S, C.monthStart(m), C.monthEnd(m), cur), all = C.flows(db, S, '1900-01-01', t, cur);
  const goals = db.goals.filter(g => !g.archived).map(g => ({ g, s: C.goalState(g, db, S, t) }));
  const line = (k, v, hint, cls = '') => `<div class="line ${cls}"><div><b>${k}</b><small>${hint}</small></div><span>${v}</span></div>`;
  return `<section class="hero"><span>إجمالي المدخرات الحالية</span><strong>${money(p.totalSavings)}</strong><small>حسابات الادخار ${moneyT(p.savingsAccounts)} ＋ الاستثمار ${moneyT(p.invested)} ＋ مخصص لأهداف في حسابات أخرى ${moneyT(p.earmarkedOutside)}</small>
    <div class="hero-row"><div><span>ادخار هذا الشهر</span><b>${money(f.net)}</b></div><div><span>نسبة الادخار</span><b>${pct(f.savingsRate, 1)}</b></div><div><span>منذ البداية</span><b>${money(all.net)}</b></div></div></section>
  <section class="card"><h3>أين أموالي؟</h3>
    ${line('الرصيد النقدي المتاح', money(p.availableCash), 'كل الأرصدة − المستثمر − المخصص لأهداف')}${line('مدخرات مخصصة لأهداف', money(p.earmarked), 'محجوزة لأهدافك وليست مصروفاً')}
    ${line('أموال مستثمرة', money(p.invested), 'أرصدة حسابات الاستثمار')}${line('مستحق لي من الجمعيات', money(p.jamiyaReceivable), 'دفعته ولم أستلم مقابله بعد')}
    ${p.jamiyaLiability ? line('التزام للجمعيات', money(-p.jamiyaLiability), 'استلمت وما زال عليّ اشتراكات', 'neg') : ''}${line('الالتزامات والديون المتبقية', money(-p.debtsRemaining), 'إجمالي ما بقي من الديون والأقساط', 'neg')}
    ${line('صافي الثروة', money(p.netWorth), 'الأرصدة ＋ مستحق الجمعيات − الالتزامات', 'total')}</section>
  <div class="actions"><button class="btn primary grow" data-a="goal-edit">＋ هدف ادخاري جديد</button></div>
  ${goals.length ? goals.map(({ g, s }) => `<section class="card item"><div class="item-h"><div><b>${esc(g.name)}</b><small>${GOAL_TYPES[g.type] || ''}${g.target_date ? ` · المستهدف ${fmtDate(g.target_date)}` : ''}</small></div><em class="badge ${s.done ? 'green' : 'gray'}">${s.done ? 'تحقق ✓' : pct(s.pct)}</em></div>
    ${bar(s.pct)}<div class="item-f"><span>ادُّخر <b>${money(s.saved, g.currency)}</b> من ${moneyT(s.target, g.currency)}</span><span>المتبقي ${moneyT(s.remaining, g.currency)}</span></div>
    <div class="item-f"><span>${s.done ? '' : s.eta ? `التحقق المتوقع: ${fmtMonth(C.ymOf(s.eta))} (بمعدل ${moneyT(s.pace, g.currency)} شهرياً)` : 'حدد ادخاراً شهرياً لتقدير موعد التحقق'}</span></div>
    <div class="actions in"><button class="btn small primary" data-a="goal-tx" data-id="${g.id}" data-kind="goal_alloc">إيداع</button><button class="btn small" data-a="goal-tx" data-id="${g.id}" data-kind="goal_withdraw">سحب</button><button class="btn small ghost" data-a="goal-edit" data-id="${g.id}">تعديل</button><button class="btn small ghost" data-a="goal-log" data-id="${g.id}">السجل</button></div></section>`).join('') : `<section class="card">${empty('أضف هدفك الأول: صندوق طوارئ، تعليم، سفر…')}</section>`}`;
}
on('goal-tx', d => { const g = St.get('goals', d.id); txForm(d.kind, { preset: { goal_id: g.id, currency: g.currency, account_id: accounts()[0]?.id }, title: `${d.kind === 'goal_alloc' ? 'إيداع في' : 'سحب من'}: ${g.name}` }); });
on('goal-log', d => openSheet(`سجل: ${St.get('goals', d.id).name}`, txList(D().transactions.filter(t => t.goal_id === d.id), { group: false, showDate: true })));
on('goal-edit', d => {
  const o = d.id ? St.get('goals', d.id) : null;
  openForm({ title: o ? 'تعديل الهدف' : 'هدف ادخاري جديد', values: o || { type: 'emergency', currency: St.S().base_currency },
    fields: [{ name: 'name', label: 'اسم الهدف', required: true, focus: !o, placeholder: 'مثال: صندوق الطوارئ' }, { name: 'type', label: 'النوع', type: 'select', options: Object.entries(GOAL_TYPES), required: true },
      { name: 'target', label: 'المبلغ المطلوب', type: 'number', required: true, half: true }, { name: 'currency', label: 'العملة', type: 'select', options: curOptions(), required: true, half: true },
      { name: 'monthly_plan', label: 'الادخار الشهري المخطط', type: 'number', half: true, hint: 'يُستخدم لتقدير موعد التحقق. إن تُرك فارغاً يُحسب من متوسط آخر 3 شهور.' }, { name: 'target_date', label: 'التاريخ المستهدف', type: 'date', half: true }, { name: 'notes', label: 'ملاحظات', type: 'textarea' }],
    onSubmit: v => { St.put('goals', { ...(o || {}), ...v }); toast('تم الحفظ'); },
    onDelete: o ? async () => { if (!(await confirmBox(`حذف الهدف «${o.name}»؟ سيتحرر المبلغ المخصص له.`, { ok: 'حذف', danger: true }))) return false; St.remove('goals', o.id); D().transactions.filter(t => t.goal_id === o.id && !(t.account_id && t.to_account_id)).forEach(t => St.remove('transactions', t.id)); } : null });
});

// ───── التقويم ─────
const cal = { filter: 'all', day: null };
export function calendar() {
  const db = D(), S = St.S(), t = today(), m = curMonth(), [y, mo] = m.split('-').map(Number);
  const monthEv = C.occurrences(db, S, C.monthStart(m), C.monthEnd(m), t);
  const allOpen = C.occurrences(db, S, '1900-01-01', C.addDays(t, 7), t).filter(e => !e.paid);
  const counts = { overdue: allOpen.filter(e => e.status === 'overdue').length, today: allOpen.filter(e => e.status === 'today').length, d3: allOpen.filter(e => e.status === 'today' || e.status === 'd3').length, d7: allOpen.filter(e => e.status !== 'overdue').length };
  let list = cal.filter === 'all' ? monthEv : allOpen.filter(e => cal.filter === 'overdue' ? e.status === 'overdue' : cal.filter === 'today' ? e.status === 'today' : cal.filter === 'd3' ? e.status === 'today' || e.status === 'd3' : e.status !== 'overdue');
  if (cal.filter === 'all' && cal.day) list = list.filter(e => e.date === cal.day);
  const byDay = new Map(); for (const e of monthEv) byDay.set(e.date, [...(byDay.get(e.date) || []), e]);
  const first = new Date(y, mo - 1, 1).getDay(), n = C.daysIn(y, mo); let cells = '';
  for (let i = 0; i < first; i++) cells += '<span class="cal-x"></span>';
  for (let d = 1; d <= n; d++) {
    const ds = C.dateIn(m, d), ev = byDay.get(ds) || [], worst = ev.some(e => e.status === 'overdue') ? 'red' : ev.some(e => !e.paid && C.isSoon(e.status)) ? 'orange' : '';
    cells += `<button class="cal-d ${ds === t ? 'now' : ''} ${cal.day === ds ? 'sel' : ''} ${worst}" data-a="cal-day" data-d="${ds}"><b>${d}</b><span>${ev.slice(0, 4).map(e => `<i class="${e.paid ? 'paid' : e.type}"></i>`).join('')}</span></button>`;
  }
  const chip = (k, l, c) => `<button class="chip ${cal.filter === k ? 'on' : ''}" data-a="cal-f" data-f="${k}">${l}${c != null ? ` <em>${c}</em>` : ''}</button>`;
  const out = list.filter(e => !e.paid && C.isOutflow(e)).reduce((s, e) => s + convNow(e.remaining, e.currency), 0);
  return `${monthNav()}<section class="card cal"><div class="cal-h">${['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map(d => `<span>${d}</span>`).join('')}</div><div class="cal-g">${cells}</div>
    <div class="legend wide"><span><i class="income"></i>دخل</span><span><i class="expense"></i>مصروف متكرر</span><span><i class="debt"></i>قسط</span><span><i class="jamiya"></i>جمعية</span><span><i class="paid"></i>تم</span></div></section>
  <div class="chips">${chip('all', cal.day ? fmtDate(cal.day) : 'مواعيد الشهر')}${chip('overdue', 'متأخر', counts.overdue)}${chip('today', 'مستحق اليوم', counts.today)}${chip('d3', 'خلال 3 أيام', counts.d3)}${chip('d7', 'خلال 7 أيام', counts.d7)}</div>
  <section class="card"><h3>${list.length} موعد${out ? ` · مطلوب دفعه ${moneyT(out)}` : ''}</h3>${list.length ? list.map(eventRow).join('') : empty('لا توجد مواعيد هنا')}</section>
  <div class="actions"><button class="btn" data-a="rec-add" data-kind="expense">＋ مصروف متكرر (إيجار، فاتورة، اشتراك)</button><button class="btn" data-a="rec-add" data-kind="income">＋ دخل متكرر</button></div>`;
}
on('cal-f', d => { cal.filter = d.f; cal.day = null; app.render(); });
on('cal-day', d => { cal.filter = 'all'; cal.day = cal.day === d.d ? null : d.d; app.render(); });
