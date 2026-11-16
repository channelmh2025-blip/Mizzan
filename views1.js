// الصفحات: الرئيسية، الدخل، المصروفات، الحسابات
import * as St from './store.js';
import * as C from './calc.js';
import { $, esc, money, moneyT, pct, fmtDate, fmtMonth, MONTHS, openForm, openSheet, closeSheet, toast, confirmBox, on, empty, bar, barChart, lineChart, donut, gauge } from './ui.js';
import { app, D, dcur, today, accounts, categories, catOf, curOptions, convNow, txList, txForm, eventRow, kv, accTypeName, KIND } from './tx.js';
import { ACCOUNT_TYPES, INCOME_TYPES } from './schema.js';

export const vs = { month: null, exp: { q: '', month: '', cat: '', from: '', to: '' }, inc: { year: '' } };
const curMonth = () => vs.month || C.ymOf(today());
export const monthNav = () => `<div class="month-nav"><button class="icon-btn" data-a="month" data-d="-1" aria-label="الشهر السابق">›</button><b>${fmtMonth(curMonth())}</b><button class="icon-btn" data-a="month" data-d="1" aria-label="الشهر التالي">‹</button>${curMonth() !== C.ymOf(today()) ? '<button class="btn tiny ghost" data-a="month" data-d="0">الشهر الحالي</button>' : ''}</div>`;
on('month', d => { vs.month = d.d === '0' ? null : C.addMonths(curMonth(), Number(d.d)); app.render(); });
const stat = (label, value, sub = '', cls = '') => `<div class="stat ${cls}"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
const mlabel = m => MONTHS[Number(m.slice(5)) - 1];

// ───── الرئيسية ─────
export function home() {
  const db = D(), S = St.S(), cur = dcur(), m = curMonth(), isNow = m === C.ymOf(today());
  const d = C.dashboard(db, S, today(), cur, m), f = d.flows;
  const months = C.monthsBetween(C.addMonths(m, -5), m);
  const series = months.map(x => C.flows(db, S, C.monthStart(x), C.monthEnd(x), cur));
  const sav = months.map(x => (C.monthStart(x) > today() ? null : C.position(db, S, C.monthEnd(x) > today() ? today() : C.monthEnd(x), cur, today()).totalSavings));
  const bud = C.budgetStatus(db, S, m, cur);
  const cats = [...f.byCat.entries()].sort((a, b) => b[1] - a[1]);
  const top = cats.slice(0, 6).map(([id, v]) => ({ label: catOf(id).name, value: v, color: catOf(id).color }));
  if (cats.length > 6) top.push({ label: 'أخرى', value: cats.slice(6).reduce((s, x) => s + x[1], 0), color: '#a8a29e' });
  const recent = [...db.transactions].sort((a, b) => (b.date + (b.created_at || '')).localeCompare(a.date + (a.created_at || ''))).slice(0, 6);
  const alerts = isNow ? d.alerts : [];
  return `${monthNav()}
  <section class="hero"><span>${isNow ? 'صافي المتاح للإنفاق الآن' : 'صافي التدفق النقدي للشهر'}</span>
    <strong>${money(isNow ? d.availableToSpend : f.net)}</strong>
    <small>${isNow ? `النقد المتاح ${moneyT(d.pos.availableCash)} − التزامات متبقية هذا الشهر ${moneyT(d.due.remaining + d.due.recurringRemaining)}` : `دخل ${moneyT(f.income)} − مصروفات ${moneyT(f.expense)} − التزامات مدفوعة ${moneyT(f.obligations)}`}</small>
    <div class="hero-row"><div><span>الدخل</span><b>${money(f.income)}</b></div><div><span>المصروفات</span><b>${money(f.expense)}</b></div><div><span>نسبة الادخار</span><b>${pct(f.savingsRate)}</b></div></div></section>
  ${alerts.length ? `<section class="card alerts"><h3>تنبيهات المواعيد <em class="badge red">${alerts.length}</em></h3>${alerts.slice(0, 4).map(eventRow).join('')}${alerts.length > 4 ? `<a class="more" href="#calendar">عرض كل المواعيد (${alerts.length})</a>` : ''}</section>` : ''}
  <section class="stats">
    ${stat('إجمالي الدخل', money(f.income), d.expectedIncome ? `متوقع لم يُستلم: ${moneyT(d.expectedIncome)}` : 'فعلي هذا الشهر', 'pos')}
    ${stat('إجمالي المصروفات', money(f.expense), `${f.byCat.size} تصنيف`, 'neg')}
    ${stat('الأقساط والالتزامات المستحقة', money(d.due.total), d.due.remaining > 0 ? `المتبقي منها: ${moneyT(d.due.remaining)}` : 'مسددة بالكامل ✓')}
    ${stat('الجمعيات المدفوعة', money(f.jamiyaPaid), f.jamiyaReceived ? `مستلم: ${moneyT(f.jamiyaReceived)}` : 'هذا الشهر')}
    ${stat('إجمالي الديون المتبقية', money(d.pos.debtsRemaining), 'حتى اليوم')}
    ${stat('إجمالي المدخرات', money(d.pos.totalSavings), `مخصص لأهداف: ${moneyT(d.pos.earmarked)}`)}
    ${stat('صافي التدفق النقدي', money(f.net), 'دخل − مصروفات − التزامات', f.net < 0 ? 'neg' : 'pos')}
    ${stat('نسبة الادخار من الدخل', pct(f.savingsRate, 1), f.income ? '' : 'لا يوجد دخل مسجل')}
  </section>
  <section class="card"><h3>الدخل مقابل المصروفات</h3>${barChart({ labels: months.map(mlabel), label: 'الدخل مقابل المصروفات', series: [{ name: 'الدخل', color: 'var(--green)', values: series.map(s => s.income) }, { name: 'المصروفات', color: 'var(--red)', values: series.map(s => s.expense) }] })}</section>
  <section class="card"><h3>توزيع المصروفات حسب التصنيف</h3>${donut({ items: top, center: 'المصروفات', label: 'توزيع المصروفات' })}</section>
  <section class="card"><h3>الميزانية مقابل المصروف الفعلي <a href="#budget">التفاصيل</a></h3>
    ${bud.rows.filter(r => r.budget > 0).length ? bud.rows.filter(r => r.budget > 0).slice(0, 6).map(r => `<div class="brow"><div><span>${esc(catOf(r.category_id).icon || '')} ${esc(catOf(r.category_id).name)}</span><b>${moneyT(r.spent)} / ${moneyT(r.budget)}</b></div>${bar(r.pct, r.level)}</div>`).join('') : empty('لم تحدد ميزانية بعد', '<a class="btn small" href="#budget">تحديد الميزانية</a>')}</section>
  <section class="card"><h3>تطور المدخرات شهرياً</h3>${lineChart({ labels: months.map(mlabel), label: 'تطور المدخرات', series: [{ name: 'المدخرات', color: 'var(--brand)', values: sav }] })}</section>
  <section class="card"><h3>نسبة الالتزامات من الدخل</h3>${d.obligationsRatio == null ? empty('سجّل دخل الشهر لحساب النسبة') : gauge(d.obligationsRatio, `أقساط وجمعيات الشهر ${moneyT(d.due.total)} من دخل ${moneyT(f.income || d.expectedIncome)} — يُنصح ألا تتجاوز 35%`)}</section>
  <section class="card"><h3>آخر العمليات <a href="#reports">الكل</a></h3>${recent.length ? txList(recent, { group: false, showDate: true }) : empty('ابدأ بتسجيل أول عملية', '<button class="btn small primary" data-a="quick-add">إضافة عملية</button>')}</section>`;
}

// ───── الدخل ─────
export function income() {
  const db = D(), S = St.S(), cur = dcur(), m = curMonth(), y = m.slice(0, 4);
  const fm = C.flows(db, S, C.monthStart(m), C.monthEnd(m), cur), fy = C.flows(db, S, `${y}-01-01`, `${y}-12-31`, cur);
  const occ = C.occurrences(db, S, C.monthStart(m), C.monthEnd(m), today()).filter(e => e.type === 'income');
  const expRec = occ.filter(e => !e.paid).reduce((s, e) => s + convNow(e.remaining, e.currency), 0);
  const list = db.transactions.filter(t => t.kind === 'income' && C.ymOf(t.date) === m);
  const rec = db.recurring.filter(r => r.kind === 'income');
  const types = [...fy.byIncomeType.entries()].sort((a, b) => b[1] - a[1]);
  return `${monthNav()}
  <section class="stats">${stat('الدخل الفعلي هذا الشهر', money(fm.income), '', 'pos')}${stat('المتوقع ولم يُستلم', money(expRec))}
    ${stat(`إجمالي دخل سنة ${y}`, money(fy.income))}${stat('متوسط الدخل الشهري', money(fy.income / Math.max(1, new Set(db.transactions.filter(t => t.kind === 'income' && t.status !== 'expected' && t.date.startsWith(y)).map(t => C.ymOf(t.date))).size)), 'للشهور التي بها دخل')}</section>
  <div class="actions"><button class="btn primary" data-a="tx-add" data-kind="income">＋ تسجيل دخل</button><button class="btn" data-a="rec-add" data-kind="income">＋ دخل شهري متكرر</button></div>
  ${occ.length ? `<section class="card"><h3>مواعيد الدخل لهذا الشهر</h3>${occ.map(eventRow).join('')}</section>` : ''}
  ${rec.length ? `<section class="card"><h3>مصادر الدخل المتكررة</h3>${rec.map(r => `<button class="tx" data-a="rec-edit" data-id="${r.id}"><span class="tx-ic pos">↻</span><span class="tx-main"><b>${esc(r.name)}</b><small>${INCOME_TYPES[r.income_type] || ''} · يوم ${r.day} من كل شهر${r.active ? '' : ' · متوقف'}</small></span><span class="tx-amt pos">${money(r.amount, r.currency)}</span></button>`).join('')}</section>` : ''}
  ${types.length ? `<section class="card"><h3>مصادر الدخل في ${y}</h3>${types.map(([k, v]) => `<div class="brow"><div><span>${INCOME_TYPES[k] || k}</span><b>${moneyT(v)} · ${pct(v / fy.income)}</b></div>${bar(v / fy.income)}</div>`).join('')}</section>` : ''}
  <section class="card"><h3>سجل الدخل — ${fmtMonth(m)}</h3>${list.length ? txList(list) : empty('لا يوجد دخل مسجل في هذا الشهر')}</section>`;
}

// ───── المصروفات ─────
function expFiltered() {
  const f = vs.exp, q = f.q.trim().toLowerCase();
  return D().transactions.filter(t => {
    if (t.kind !== 'expense') return false;
    if (f.from || f.to) { if (f.from && t.date < f.from) return false; if (f.to && t.date > f.to) return false; }
    else if (f.month !== 'all' && C.ymOf(t.date) !== (f.month || curMonth())) return false;
    if (f.cat && t.category_id !== f.cat) return false;
    if (q && !`${t.description || ''} ${t.notes || ''} ${catOf(t.category_id).name} ${t.amount}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
function expListHtml() {
  const l = expFiltered(), total = l.reduce((s, t) => s + C.convTx(t, Number(t.amount), t.currency, dcur(), St.S()), 0);
  return `<p class="list-sum">${l.length} عملية · الإجمالي <b>${moneyT(total)}</b></p>${txList(l)}`;
}
export function expenses() {
  const db = D(), S = St.S(), cur = dcur(), t = today(), m = curMonth();
  const [y, mo, dd] = t.split('-').map(Number), wd = new Date(y, mo - 1, dd).getDay(), wStart = C.addDays(t, -((wd + 1) % 7)); // الأسبوع يبدأ السبت
  const fd = C.flows(db, S, t, t, cur), fw = C.flows(db, S, wStart, t, cur), fm = C.flows(db, S, C.monthStart(m), C.monthEnd(m), cur);
  const top = [...fm.byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), f = vs.exp;
  return `${monthNav()}
  <section class="stats three">${stat('اليوم', money(fd.expense))}${stat('هذا الأسبوع', money(fw.expense), 'من السبت')}${stat(fmtMonth(m), money(fm.expense), '', 'neg')}</section>
  <div class="actions"><button class="btn primary grow" data-a="tx-add" data-kind="expense">＋ إضافة مصروف</button></div>
  ${top.length ? `<section class="card"><h3>أكثر التصنيفات استهلاكاً</h3>${top.map(([id, v]) => `<div class="brow"><div><span>${esc(catOf(id).icon || '')} ${esc(catOf(id).name)}</span><b>${moneyT(v)} · ${pct(v / fm.expense)}</b></div><div class="pbar"><i style="width:${(v / top[0][1]) * 100}%;background:${catOf(id).color}"></i></div></div>`).join('')}</section>` : ''}
  <section class="card"><h3>سجل المصروفات</h3>
    <div class="filters"><input type="search" id="exp-q" placeholder="بحث في الوصف أو التصنيف أو المبلغ…" value="${esc(f.q)}" aria-label="بحث">
      <select id="exp-cat" aria-label="التصنيف"><option value="">كل التصنيفات</option>${categories(true).map(c => `<option value="${c.id}"${f.cat === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select id="exp-month" aria-label="الفترة"><option value="">${fmtMonth(m)}</option><option value="all"${f.month === 'all' ? ' selected' : ''}>كل الفترات</option></select>
      <label>من <input type="date" id="exp-from" value="${f.from}"></label><label>إلى <input type="date" id="exp-to" value="${f.to}"></label>
      ${f.q || f.cat || f.month || f.from || f.to ? '<button class="btn tiny ghost" data-a="exp-clear">مسح الفلاتر</button>' : ''}</div>
    <div id="exp-list">${expListHtml()}</div></section>`;
}
expenses.after = root => {
  const upd = () => { $('#exp-list', root).innerHTML = expListHtml(); };
  $('#exp-q', root).addEventListener('input', e => { vs.exp.q = e.target.value; upd(); });
  for (const [id, k] of [['exp-cat', 'cat'], ['exp-month', 'month'], ['exp-from', 'from'], ['exp-to', 'to']]) $(`#${id}`, root).addEventListener('change', e => { vs.exp[k] = e.target.value; app.render(); });
};
on('exp-clear', () => { vs.exp = { q: '', month: '', cat: '', from: '', to: '' }; app.render(); });

// ───── الحسابات ─────
export function accountsView() {
  const db = D(), S = St.S(), cur = dcur(), bal = C.accountBalances(db, S), list = accounts(true);
  const total = list.reduce((s, a) => s + convNow(bal.get(a.id) || 0, a.currency), 0);
  const byCur = new Map(); for (const a of list) byCur.set(a.currency, (byCur.get(a.currency) || 0) + (bal.get(a.id) || 0));
  return `<section class="hero"><span>إجمالي الأرصدة (بـ${esc(S.currencies[cur].name)})</span><strong>${money(total)}</strong>
    <small>${[...byCur.entries()].map(([c, v]) => moneyT(v, c)).join(' ＋ ')}</small></section>
  <div class="actions"><button class="btn primary" data-a="tx-add" data-kind="transfer">⇄ تحويل بين الحسابات</button><button class="btn" data-a="acc-edit">＋ حساب جديد</button></div>
  <section class="card"><h3>الحسابات</h3>${list.length ? list.map(a => `<button class="tx ${a.archived ? 'expected' : ''}" data-a="acc-open" data-id="${a.id}"><span class="tx-ic neu">${{ cash: '💵', bank: '🏦', wallet: '📱', savings: '🐖', investment: '📈' }[a.type] || '•'}</span>
    <span class="tx-main"><b>${esc(a.name)}</b><small>${accTypeName(a.type)} · ${a.currency}${a.archived ? ' · مؤرشف' : ''}</small></span>
    <span class="tx-amt ${(bal.get(a.id) || 0) < 0 ? 'neg' : ''}">${money(bal.get(a.id) || 0, a.currency)}${a.currency !== cur ? `<small>≈ ${moneyT(convNow(bal.get(a.id) || 0, a.currency))}</small>` : ''}</span></button>`).join('') : empty('لا توجد حسابات')}</section>
  <p class="hint">التحويل بين حساباتك ينقل المال فقط ولا يُحتسب دخلاً ولا مصروفاً.</p>`;
}
function accForm(id) {
  const a = id ? St.get('accounts', id) : null;
  openForm({ title: a ? 'تعديل الحساب' : 'حساب جديد', values: a || { type: 'bank', currency: St.S().base_currency, opening_balance: 0, opening_date: today() },
    fields: [{ name: 'name', label: 'اسم الحساب', required: true, placeholder: 'مثال: الراجحي — الجاري', focus: !a }, { name: 'type', label: 'النوع', type: 'select', options: Object.entries(ACCOUNT_TYPES), required: true, half: true },
      { name: 'currency', label: 'العملة', type: 'select', options: curOptions(), required: true, half: true, hint: a ? 'تغيير عملة حساب به عمليات يغيّر تفسير رصيده.' : '' },
      { name: 'opening_balance', label: 'الرصيد الافتتاحي', type: 'number', allowNegative: true, half: true, hint: 'الرصيد الموجود فعلاً عند بدء استخدام التطبيق.' }, { name: 'opening_date', label: 'بتاريخ', type: 'date', half: true, required: true },
      { name: 'archived', label: 'الأرشفة', type: 'toggle', text: 'إخفاء الحساب من قوائم الاختيار', show: () => !!a }, { name: 'notes', label: 'ملاحظات', type: 'textarea' }],
    onSubmit: v => { St.put('accounts', { ...(a || { sort: accounts(true).length }), ...v, opening_balance: v.opening_balance === '' ? 0 : v.opening_balance }); toast('تم الحفظ'); },
    onDelete: a ? async () => {
      if (D().transactions.some(t => t.account_id === a.id || t.to_account_id === a.id)) { toast('لا يمكن حذف حساب به عمليات. يمكنك أرشفته بدلاً من ذلك.', 'bad'); return false; }
      if (!(await confirmBox(`حذف حساب «${a.name}»؟`, { ok: 'حذف', danger: true }))) return false; St.remove('accounts', a.id);
    } : null });
}
on('acc-edit', d => accForm(d.id));
on('acc-open', d => {
  const a = St.get('accounts', d.id); if (!a) return; const bal = C.accountBalances(D(), St.S()).get(a.id) || 0;
  const txs = D().transactions.filter(t => t.account_id === a.id || t.to_account_id === a.id);
  openSheet(a.name, `<div class="kvs">${kv('الرصيد الحالي', money(bal, a.currency))}${kv('الرصيد الافتتاحي', money(a.opening_balance || 0, a.currency))}${kv('النوع', accTypeName(a.type))}</div>
    <div class="actions"><button class="btn" data-a="acc-adjust" data-id="${a.id}">≈ تسوية الرصيد</button><button class="btn" data-a="acc-edit" data-id="${a.id}">تعديل</button></div>
    <h3 class="sub">حركات الحساب</h3>${txList(txs, { limit: 60 })}`);
});
on('acc-adjust', d => {
  const a = St.get('accounts', d.id), bal = C.accountBalances(D(), St.S()).get(a.id) || 0;
  openForm({ title: `تسوية رصيد: ${a.name}`, intro: `<p class="hint">الرصيد المحسوب في التطبيق: <b>${moneyT(bal, a.currency)}</b>. أدخل الرصيد الفعلي وسيُسجَّل الفرق كتسوية (ليست دخلاً ولا مصروفاً).</p>`,
    fields: [{ name: 'actual', label: `الرصيد الفعلي (${a.currency})`, type: 'number', required: true, allowZero: true, allowNegative: true, focus: true }, { name: 'notes', label: 'ملاحظات', type: 'textarea' }],
    onSubmit: v => { const diff = C.r3(v.actual - bal); if (!diff) { toast('الرصيد مطابق'); return; } St.put('transactions', { kind: 'adjust', status: 'actual', date: today(), amount: diff, currency: a.currency, account_id: a.id, rates: { ...St.S().rates }, notes: v.notes, description: 'تسوية رصيد' }); toast('تمت التسوية'); } });
});
export { stat, mlabel, curMonth };
