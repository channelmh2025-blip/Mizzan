// الصفحات: التقارير، الإعدادات (العملات، التصنيفات، المتكرر، النسخ الاحتياطي، الحساب)
import * as St from './store.js';
import * as C from './calc.js';
import { $, $$, esc, money, moneyT, nfmt, pct, fmtDate, fmtMonth, MONTHS, parseNum, openForm, openSheet, closeSheet, toast, confirmBox, on, empty, barChart, lineChart, donut, download, csv } from './ui.js';
import { app, D, dcur, today, accOptions, categories, catOf, curOptions, txList, txTitle, KIND, accName, kv } from './tx.js';
import { INCOME_TYPES, PAY_METHODS, PALETTE, CURRENCIES } from './schema.js';
import { stat } from './views1.js';

// ───── التقارير ─────
const rp = { preset: 'year', year: null, from: '', to: '', cur: null, tab: 'report', q: '', kind: '' };
function range() {
  const t = today(), y = rp.year || t.slice(0, 4), ym = C.ymOf(t);
  const first = D().transactions.reduce((m, x) => (x.date < m ? x.date : m), t);
  switch (rp.preset) {
    case 'prev': return [`${Number(t.slice(0, 4)) - 1}-01-01`, `${Number(t.slice(0, 4)) - 1}-12-31`, `سنة ${Number(t.slice(0, 4)) - 1}`];
    case 'm3': return [C.monthStart(C.addMonths(ym, -2)), t, 'آخر 3 شهور'];
    case 'm6': return [C.monthStart(C.addMonths(ym, -5)), t, 'آخر 6 شهور'];
    case 'all': return [first, t, 'منذ بداية الاستخدام'];
    case 'custom': return [rp.from || C.monthStart(ym), rp.to || t, `من ${fmtDate(rp.from || C.monthStart(ym))} إلى ${fmtDate(rp.to || t)}`];
    default: return [`${y}-01-01`, `${y}-12-31`, `سنة ${y}`];
  }
}
const years = () => { const s = new Set(D().transactions.map(t => t.date.slice(0, 4))); s.add(today().slice(0, 4)); return [...s].sort().reverse(); };
function txInRange() {
  const [a, b] = range(), q = rp.q.trim().toLowerCase();
  return D().transactions.filter(t => t.date >= a && t.date <= b && (!rp.kind || t.kind === rp.kind) && (!q || `${txTitle(t)} ${t.notes || ''} ${t.description || ''} ${t.amount} ${accName(t.account_id)}`.toLowerCase().includes(q)));
}
const allListHtml = () => { const l = txInRange(); return `<p class="list-sum">${l.length} عملية</p>${txList(l, { limit: 400 })}`; };
export function reports() {
  const db = D(), S = St.S(), cur = rp.cur || dcur(), [a, b, label] = range(), t = today();
  const head = `<div class="seg-tabs"><button class="${rp.tab === 'report' ? 'on' : ''}" data-a="rp-tab" data-t="report">التقرير المالي</button><button class="${rp.tab === 'all' ? 'on' : ''}" data-a="rp-tab" data-t="all">كل العمليات</button></div>
  <div class="filters no-print"><select id="rp-preset" aria-label="الفترة">${[['year', 'سنة مالية محددة'], ['prev', 'السنة السابقة'], ['m3', 'آخر 3 شهور'], ['m6', 'آخر 6 شهور'], ['all', 'منذ بداية الاستخدام'], ['custom', 'من تاريخ إلى تاريخ']].map(([k, l]) => `<option value="${k}"${rp.preset === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
    ${rp.preset === 'year' ? `<select id="rp-year" aria-label="السنة">${years().map(y => `<option${(rp.year || t.slice(0, 4)) === y ? ' selected' : ''}>${y}</option>`).join('')}</select>` : ''}
    ${rp.preset === 'custom' ? `<label>من <input type="date" id="rp-from" value="${a}"></label><label>إلى <input type="date" id="rp-to" value="${b}"></label>` : ''}
    <select id="rp-cur" aria-label="عملة التقرير">${Object.keys(S.currencies).map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>بعملة ${S.currencies[c].name}</option>`).join('')}</select></div>`;
  if (rp.tab === 'all') return `${head}<section class="card"><div class="filters"><input type="search" id="rp-q" placeholder="بحث في كل العمليات…" value="${esc(rp.q)}" aria-label="بحث">
      <select id="rp-kind" aria-label="النوع"><option value="">كل الأنواع</option>${Object.entries(KIND).map(([k, v]) => `<option value="${k}"${rp.kind === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select>
      <button class="btn tiny" data-a="rp-csv-tx">تصدير CSV / Excel</button></div><div id="rp-list">${allListHtml()}</div></section>`;
  const r = C.report(db, S, a, b, cur, t), f = r.flows, M = r.months, multi = M.length && M[0].month.slice(0, 4) !== M[M.length - 1].month.slice(0, 4);
  const lab = M.map(m => (multi ? `${Number(m.month.slice(5))}/${m.month.slice(2, 4)}` : MONTHS[Number(m.month.slice(5)) - 1]));
  const cats = [...f.byCat.entries()].sort((x, y) => y[1] - x[1]), top = cats.slice(0, 7).map(([id, v]) => ({ label: catOf(id).name, value: v, color: catOf(id).color }));
  if (cats.length > 7) top.push({ label: 'أخرى', value: cats.slice(7).reduce((s, x) => s + x[1], 0), color: '#a8a29e' });
  const yc = C.yearsCompare(db, S, cur, t), fx = C.fxDifference(db, S, cur), el = M.filter(m => !m.future), m = v => money(v, cur), mt = v => moneyT(v, cur);
  const fmt = v => moneyT(v, cur);
  return `${head}<div id="report">
  <section class="hero"><span>التقرير المالي — ${label}</span><strong>${m(f.net)}</strong><small>صافي التدفق النقدي = دخل ${mt(f.income)} − مصروفات ${mt(f.expense)} − التزامات مدفوعة ${mt(f.obligations)}</small>
    <div class="hero-row"><div><span>نسبة الادخار</span><b>${pct(f.savingsRate, 1)}</b></div><div><span>صافي الثروة</span><b>${m(r.endPos.netWorth)}</b></div><div><span>عدد العمليات</span><b>${f.count}</b></div></div></section>
  <section class="stats">
    ${stat('1 · إجمالي الدخل', m(f.income), '', 'pos')}${stat('2 · إجمالي المصروفات', m(f.expense), '', 'neg')}
    ${stat('3 · إجمالي الأقساط المسددة', m(f.debtPaid))}${stat('4 · ديون سُددت بالكامل', m(r.settledTotal), r.settled.length ? r.settled.map(x => esc(x.name)).join('، ') : 'لا يوجد')}
    ${stat('5 · مدفوعات الجمعيات', m(f.jamiyaPaid))}${stat('6 · مبالغ الجمعيات المستلمة', m(f.jamiyaReceived), 'ليست دخلاً')}
    ${stat('7 · إجمالي المدخرات المتراكمة', m(r.endPos.totalSavings), 'في نهاية الفترة')}${stat('8 · صافي التدفق النقدي', m(f.net), '', f.net < 0 ? 'neg' : 'pos')}
    ${stat('9 · الديون المتبقية بنهاية الفترة', m(r.endPos.debtsRemaining))}${stat('10 · نسبة الادخار', pct(f.savingsRate, 1))}
    ${stat('11 · أعلى شهر في المصروفات', r.maxMonth ? m(r.maxMonth.expense) : '—', r.maxMonth ? fmtMonth(r.maxMonth.month) : '')}${stat('12 · أقل شهر في المصروفات', r.minMonth ? m(r.minMonth.expense) : '—', r.minMonth ? fmtMonth(r.minMonth.month) : '')}
    ${stat('13 · متوسط المصروف الشهري', m(r.avgMonthlyExpense), `عدد الشهور: ${r.monthsCount}`)}${stat('14 · تطور الأرصدة', el.length ? `${m(el[el.length - 1].balances)}` : '—', `بداية الفترة: ${mt(C.position(db, S, C.addDays(a, -1), cur, t).totalBalances)}`)}
  </section>
  ${f.debtReceived || f.adjust ? `<p class="hint">خارج الدخل والمصروف: قروض مستلمة ${mt(f.debtReceived)} · تسويات أرصدة ${mt(f.adjust)}.</p>` : ''}
  <section class="card"><h3>الدخل مقابل المصروفات لكل شهر</h3>${barChart({ labels: lab, fmt, series: [{ name: 'الدخل', color: 'var(--green)', values: M.map(x => (x.future ? null : x.income)) }, { name: 'المصروفات', color: 'var(--red)', values: M.map(x => (x.future ? null : x.expense)) }] })}</section>
  <section class="card"><h3>المدخرات المتراكمة خلال الفترة</h3>${lineChart({ labels: lab, fmt, series: [{ name: 'صافي التدفق التراكمي', color: 'var(--brand)', values: M.map(x => x.cumNet) }] })}</section>
  <section class="card"><h3>تطور الأرصدة والمدخرات</h3>${lineChart({ labels: lab, fmt, area: false, series: [{ name: 'إجمالي الأرصدة', color: 'var(--blue)', values: M.map(x => x.balances) }, { name: 'المدخرات', color: 'var(--brand)', values: M.map(x => x.savings) }] })}</section>
  <section class="card"><h3>توزيع المصروفات</h3>${donut({ items: top, center: 'المصروفات', fmt })}</section>
  <section class="card"><h3>تطور الديون</h3>${lineChart({ labels: lab, fmt, series: [{ name: 'الديون المتبقية', color: 'var(--red)', values: M.map(x => x.debts) }] })}</section>
  <section class="card"><h3>تطور الأقساط والالتزامات المدفوعة</h3>${barChart({ labels: lab, fmt, series: [{ name: 'أقساط وديون', color: 'var(--orange)', values: M.map(x => (x.future ? null : x.debtPaid)) }, { name: 'جمعيات', color: 'var(--blue)', values: M.map(x => (x.future ? null : x.jamiyaPaid)) }] })}</section>
  <section class="card"><h3>مقارنة الادخار بين السنوات</h3>${barChart({ labels: yc.map(x => x.year), fmt, series: [{ name: 'صافي الادخار', color: 'var(--brand)', values: yc.map(x => x.net) }] })}
    <div class="table-wrap"><table class="sched"><thead><tr><th>السنة</th><th>الدخل</th><th>المصروفات</th><th>الصافي</th><th>نسبة الادخار</th></tr></thead><tbody>${yc.map(x => `<tr><td>${x.year}</td><td>${mt(x.income)}</td><td>${mt(x.expense)}</td><td>${mt(x.net)}</td><td>${pct(x.savingsRate, 1)}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="card"><h3>الجدول الشهري</h3><div class="table-wrap"><table class="sched"><thead><tr><th>الشهر</th><th>الدخل</th><th>المصروفات</th><th>الالتزامات</th><th>الصافي</th><th>التراكمي</th></tr></thead><tbody>
    ${el.map(x => `<tr><td>${fmtMonth(x.month)}</td><td>${nfmt(x.income)}</td><td>${nfmt(x.expense)}</td><td>${nfmt(x.obligations)}</td><td class="${x.net < 0 ? 'neg' : ''}">${nfmt(x.net)}</td><td>${nfmt(x.cumNet)}</td></tr>`).join('')}
    <tr class="total"><td>الإجمالي</td><td>${nfmt(f.income)}</td><td>${nfmt(f.expense)}</td><td>${nfmt(f.obligations)}</td><td>${nfmt(f.net)}</td><td></td></tr></tbody></table></div></section>
  <section class="card"><h3>تقرير كل عملة على حدة (بالقيم الأصلية)</h3>${r.perCurrency.size ? `<div class="table-wrap"><table class="sched"><thead><tr><th>العملة</th><th>الدخل</th><th>المصروفات</th><th>الالتزامات</th><th>الصافي</th></tr></thead><tbody>${[...r.perCurrency.entries()].map(([c, o]) => `<tr><td>${esc(S.currencies[c]?.name || c)}</td><td>${moneyT(o.income, c)}</td><td>${moneyT(o.expense, c)}</td><td>${moneyT(o.obligations, c)}</td><td>${moneyT(o.income - o.expense - o.obligations, c)}</td></tr>`).join('')}</tbody></table></div>` : empty('لا توجد عمليات في الفترة')}
    <p class="hint">في التقرير الموحد تُحوَّل كل عملية بسعر الصرف المحفوظ يوم تسجيلها، والأرصدة بسعر اليوم.${Math.abs(fx.diff) > 0.005 ? ` فرق أسعار الصرف على أرصدتك بالعملات الأخرى: <b>${moneyT(fx.diff, cur)}</b> (القيمة الحالية ${mt(fx.current)} مقابل ${mt(fx.book)} بأسعار تواريخ العمليات).` : ''}</p></section>
  </div>
  <div class="actions no-print"><button class="btn primary" data-a="rp-print">🖨 طباعة / حفظ PDF</button><button class="btn" data-a="rp-csv">تصدير الملخص CSV</button><button class="btn" data-a="rp-csv-tx">تصدير العمليات CSV</button></div>`;
}
reports.after = root => {
  const bind = (id, k, ev = 'change') => $(`#${id}`, root)?.addEventListener(ev, e => { rp[k] = e.target.value; app.render(); });
  bind('rp-preset', 'preset'); bind('rp-year', 'year'); bind('rp-from', 'from'); bind('rp-to', 'to'); bind('rp-cur', 'cur'); bind('rp-kind', 'kind');
  $('#rp-q', root)?.addEventListener('input', e => { rp.q = e.target.value; $('#rp-list', root).innerHTML = allListHtml(); });
};
on('rp-tab', d => { rp.tab = d.t; app.render(); });
on('rp-print', () => window.print());
on('rp-csv', () => {
  const cur = rp.cur || dcur(), [a, b, label] = range(), r = C.report(D(), St.S(), a, b, cur, today());
  download(`mizan-report-${a}_${b}.csv`, csv([[`ميزان — ${label}`, `العملة: ${cur}`], [], ['الشهر', 'الدخل', 'المصروفات', 'أقساط وديون', 'جمعيات', 'الصافي', 'التراكمي', 'الأرصدة', 'المدخرات', 'الديون المتبقية'],
    ...r.months.filter(m => !m.future).map(m => [m.month, m.income, m.expense, m.debtPaid, m.jamiyaPaid, m.net, m.cumNet, m.balances, m.savings, m.debts]),
    ['الإجمالي', r.flows.income, r.flows.expense, r.flows.debtPaid, r.flows.jamiyaPaid, r.flows.net]]), 'text/csv;charset=utf-8');
});
export function exportTxCsv(list) {
  const S = St.S();
  download(`mizan-transactions-${today()}.csv`, csv([['التاريخ', 'النوع', 'البيان', 'التصنيف', 'المبلغ', 'العملة', `المقابل بـ${S.base_currency}`, 'الحساب', 'إلى حساب', 'طريقة الدفع', 'الحالة', 'ملاحظات'],
    ...[...list].sort((a, b) => a.date.localeCompare(b.date)).map(t => [t.date, KIND[t.kind]?.label || t.kind, txTitle(t), t.kind === 'expense' ? catOf(t.category_id).name : t.kind === 'income' ? INCOME_TYPES[t.income_type] || '' : '', t.amount, t.currency,
      C.r3(C.convTx(t, Number(t.amount), t.currency, S.base_currency, S)), accName(t.account_id), t.to_account_id ? accName(t.to_account_id) : '', PAY_METHODS[t.payment_method] || '', t.status === 'expected' ? 'متوقع' : 'فعلي', t.notes || ''])]), 'text/csv;charset=utf-8');
}
on('rp-csv-tx', () => exportTxCsv(txInRange()));

// ───── المتكرر ─────
function recForm(kind, id) {
  const o = id ? St.get('recurring', id) : null; kind = o?.kind || kind;
  openForm({ title: o ? 'تعديل العملية المتكررة' : kind === 'income' ? 'دخل شهري متكرر' : 'مصروف شهري متكرر', values: o || { currency: St.S().base_currency, day: 1, start_date: today(), active: true, income_type: 'salary', payment_method: 'transfer' },
    intro: '<p class="hint">يظهر في التقويم والتنبيهات كل شهر، ولا يُحتسب فعلياً إلا عند تأكيد الدفع/الاستلام.</p>',
    fields: [{ name: 'name', label: 'الاسم', required: true, focus: !o, placeholder: kind === 'income' ? 'مثال: الراتب الشهري' : 'مثال: إيجار الشقة' }, { name: 'amount', label: 'المبلغ', type: 'number', required: true, half: true }, { name: 'currency', label: 'العملة', type: 'select', options: curOptions(), required: true, half: true },
      { name: 'day', label: 'يوم الاستحقاق من كل شهر', type: 'int', required: true, half: true, validate: v => (v < 1 || v > 31 ? 'من 1 إلى 31' : '') },
      kind === 'income' ? { name: 'income_type', label: 'نوع الدخل', type: 'select', options: Object.entries(INCOME_TYPES), required: true, half: true } : { name: 'category_id', label: 'التصنيف', type: 'select', options: categories().map(c => [c.id, c.name]), required: true, half: true },
      { name: 'account_id', label: 'الحساب', type: 'select', options: accOptions(), half: true }, { name: 'start_date', label: 'يبدأ من', type: 'date', required: true, half: true }, { name: 'end_date', label: 'ينتهي في', type: 'date', half: true },
      { name: 'active', label: 'الحالة', type: 'toggle', text: 'مفعّل' }, { name: 'notes', label: 'ملاحظات', type: 'textarea' }],
    onSubmit: v => { St.put('recurring', { ...(o || {}), ...v, kind }); toast('تم الحفظ'); },
    onDelete: o ? async () => { if (!(await confirmBox(`حذف «${o.name}»؟ العمليات المسجلة سابقاً تبقى كما هي.`, { ok: 'حذف', danger: true }))) return false; St.remove('recurring', o.id); } : null });
}
on('rec-add', d => recForm(d.kind)); on('rec-edit', d => recForm(null, d.id));

// ───── الإعدادات ─────
let authApi = { signOut: async () => {}, changePassword: async () => {} };
export const setAuthApi = a => { authApi = a; };
const ago = iso => { if (!iso) return 'لم تتم بعد'; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'الآن' : s < 3600 ? `قبل ${Math.floor(s / 60)} دقيقة` : s < 86400 ? `قبل ${Math.floor(s / 3600)} ساعة` : fmtDate(iso.slice(0, 10)); };
export function settings() {
  const S = St.S(), st = St.st, base = S.base_currency, rec = D().recurring, others = Object.keys(S.currencies).filter(c => c !== base);
  const notif = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission, nOn = localStorage.getItem('mizan-notify') === '1' && notif === 'granted';
  return `<section class="card"><h3>الحساب والمزامنة</h3>
    ${st.cloud ? `<div class="kvs">${kv('البريد الإلكتروني', `<span dir="ltr">${esc(st.email || '')}</span>`)}${kv('الاتصال', navigator.onLine ? 'متصل' : 'بدون إنترنت')}${kv('آخر مزامنة', ago(st.lastSync))}${kv('تعديلات بانتظار الرفع', st.pending)}</div>
      ${st.syncError ? `<p class="hint red">تعذرت المزامنة: ${esc(st.syncError)}</p>` : ''}
      <div class="actions in"><button class="btn small" data-a="sync-now">مزامنة الآن</button><button class="btn small" data-a="pw-change">تغيير كلمة المرور</button><button class="btn small ghost danger-t" data-a="sign-out">تسجيل الخروج</button></div>`
    : `<p class="hint"><b>الوضع المحلي:</b> لم يُربط التطبيق بقاعدة Supabase بعد (ملف js/config.js فارغ). بياناتك محفوظة على هذا الجهاز وهذا المتصفح فقط، ولا تتزامن مع أجهزة أخرى، وقد تُفقد إذا مُسحت بيانات المتصفح. لنقلها: صدّر نسخة احتياطية ثم استعدها بعد تسجيل الدخول في النسخة السحابية.</p>`}</section>
  <section class="card"><h3>العملات وأسعار الصرف</h3>
    <div class="form two"><div class="f half"><label class="lbl" for="set-base">العملة الأساسية</label><select id="set-base">${curOptions().map(([k, l]) => `<option value="${k}"${k === base ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    <div class="f half"><label class="lbl" for="set-disp">عملة العرض في اللوحة</label><select id="set-disp">${curOptions().map(([k, l]) => `<option value="${k}"${k === S.display_currency ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
    <p class="hint">تغيير العملة الأساسية أو عملة العرض يعيد حساب القيم المعروضة فقط؛ مبلغ كل عملية وعملتها الأصلية وسعر صرفها يوم تسجيلها لا تتغير.</p>
    <div class="rates">${others.map(c => `<label><span>1 ${esc(S.currencies[c].name)} =</span><input dir="ltr" inputmode="decimal" data-rate="${c}" value="${Number((S.rates[base] / S.rates[c]).toPrecision(8))}"><span>${esc(S.currencies[base].symbol)}</span></label>`).join('')}</div>
    <p class="hint">آخر تحديث: ${S.rates_updated_at ? `${fmtDate(S.rates_updated_at.slice(0, 10))} (${S.rates_source === 'manual' ? 'إدخال يدوي' : esc(S.rates_source || '')})` : '<b class="red">أسعار مبدئية تقريبية — حدّثها قبل استخدام أكثر من عملة</b>'}</p>
    <div class="actions in"><button class="btn small primary" data-a="rates-save">حفظ الأسعار يدوياً</button><button class="btn small" data-a="rates-fetch">تحديث من الإنترنت</button><button class="btn small" data-a="cur-add">＋ عملة أخرى</button></div>
    <p class="hint">التحديث الآلي من خدمة ExchangeRate-API المجانية (open.er-api.com)، تتحدث مرة يومياً وقد تختلف قليلاً عن سعر بنكك.</p></section>
  <section class="card"><h3>تصنيفات المصروفات <button class="btn tiny" data-a="cat-edit">＋ تصنيف</button></h3><div class="chips wrap">${categories(true).map(c => `<button class="chip ${c.archived ? 'off' : ''}" data-a="cat-edit" data-id="${c.id}" style="border-color:${c.color}55">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('')}</div></section>
  <section class="card"><h3>العمليات المتكررة <span><button class="btn tiny" data-a="rec-add" data-kind="expense">＋ مصروف</button> <button class="btn tiny" data-a="rec-add" data-kind="income">＋ دخل</button></span></h3>
    ${rec.length ? rec.map(r => `<button class="tx ${r.active ? '' : 'expected'}" data-a="rec-edit" data-id="${r.id}"><span class="tx-ic ${r.kind === 'income' ? 'pos' : 'neg'}">↻</span><span class="tx-main"><b>${esc(r.name)}</b><small>${r.kind === 'income' ? 'دخل' : esc(catOf(r.category_id).name)} · يوم ${r.day}${r.active ? '' : ' · متوقف'}</small></span><span class="tx-amt">${money(r.amount, r.currency)}</span></button>`).join('') : empty('الراتب، الإيجار، الفواتير، الاشتراكات…')}</section>
  <section class="card"><h3>التنبيهات</h3><label class="toggle"><input type="checkbox" id="set-notif" ${nOn ? 'checked' : ''} ${notif === 'unsupported' ? 'disabled' : ''}><span></span><em>إشعار بالمواعيد المستحقة والمتأخرة عند فتح التطبيق</em></label>
    <p class="hint">${notif === 'unsupported' ? 'هذا المتصفح لا يدعم الإشعارات. على iPhone أضف التطبيق إلى الشاشة الرئيسية أولاً.' : notif === 'denied' ? 'الإشعارات محظورة من إعدادات المتصفح لهذا الموقع.' : 'التنبيهات داخل التطبيق (الرئيسية والتقويم) تعمل دائماً. إشعارات النظام تظهر عند فتح التطبيق؛ الإشعار والتطبيق مغلق تماماً يحتاج خادماً إضافياً غير مضمَّن.'}</p></section>
  <section class="card"><h3>العرض</h3><div class="form two"><div class="f half"><label class="lbl" for="set-digits">الأرقام</label><select id="set-digits"><option value="en"${S.prefs.digits !== 'ar' ? ' selected' : ''}>1234567890</option><option value="ar"${S.prefs.digits === 'ar' ? ' selected' : ''}>١٢٣٤٥٦٧٨٩٠</option></select></div>
    <div class="f half"><label class="lbl" for="set-date">صيغة التاريخ</label><select id="set-date">${[['long', '15 نوفمبر 2026'], ['dmy', '15/11/2026'], ['iso', '2026-11-15']].map(([k, l]) => `<option value="${k}"${(S.prefs.dateFmt || 'long') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div></section>
  <section class="card"><h3>النسخ الاحتياطي والتصدير</h3><div class="actions in"><button class="btn small primary" data-a="bk-export">تنزيل نسخة احتياطية (JSON)</button><button class="btn small" data-a="bk-import" data-mode="merge">استعادة (دمج)</button><button class="btn small ghost danger-t" data-a="bk-import" data-mode="replace">استعادة (استبدال الكل)</button><button class="btn small" data-a="bk-csv">تصدير كل العمليات CSV / Excel</button></div>
    <input type="file" id="bk-file" accept="application/json,.json" hidden><p class="hint">«دمج» يضيف ما في الملف ويحدّث المتطابق. «استبدال الكل» يجعل بياناتك مطابقة للملف ويحذف ما عداه.</p></section>
  <section class="card"><h3>طريقة الحساب</h3><button class="btn small" data-a="formulas">عرض المعادلات والقواعد المالية</button><p class="hint">ميزان · الإصدار 1.0</p></section>`;
}
settings.after = root => {
  $('#set-base', root).addEventListener('change', async e => {
    const v = e.target.value, S = St.S();
    if (!(await confirmBox(`تغيير العملة الأساسية إلى ${S.currencies[v].name}؟ ستُعاد حسابات العرض والتقارير بأسعار الصرف، ولن تتغير القيم الأصلية للعمليات.`))) { app.render(); return; }
    St.updateSettings({ base_currency: v, display_currency: S.display_currency === S.base_currency ? v : S.display_currency }); toast('تم تغيير العملة الأساسية');
  });
  $('#set-disp', root).addEventListener('change', e => St.updateSettings({ display_currency: e.target.value }));
  $('#set-digits', root).addEventListener('change', e => St.setPref('digits', e.target.value));
  $('#set-date', root).addEventListener('change', e => St.setPref('dateFmt', e.target.value));
  $('#set-notif', root).addEventListener('change', async e => {
    if (e.target.checked) { const p = await Notification.requestPermission(); if (p !== 'granted') { toast('لم يُسمح بالإشعارات', 'bad'); localStorage.removeItem('mizan-notify'); app.render(); return; } localStorage.setItem('mizan-notify', '1'); toast('تم تفعيل الإشعارات'); }
    else localStorage.removeItem('mizan-notify');
  });
  $('#bk-file', root).addEventListener('change', async e => {
    const file = e.target.files[0], mode = e.target.dataset.mode; if (!file) return;
    try {
      const b = JSON.parse(await file.text()), n = Object.values(b.tables || {}).reduce((s, x) => s + x.length, 0);
      if (!(await confirmBox(mode === 'replace' ? `استبدال كل بياناتك الحالية بمحتوى الملف (${n} سجل)؟ لا يمكن التراجع.` : `دمج ${n} سجل من الملف مع بياناتك؟`, { danger: mode === 'replace', ok: 'استعادة' }))) return;
      St.importBackup(b, mode); toast('تمت الاستعادة');
    } catch (er) { toast(er.message || 'ملف غير صالح', 'bad'); } finally { e.target.value = ''; }
  });
};
on('sync-now', async () => { await St.sync(true); toast(St.st.syncError ? 'تعذرت المزامنة' : 'تمت المزامنة', St.st.syncError ? 'bad' : 'ok'); });
on('sign-out', async () => {
  if (St.st.pending && !(await confirmBox(`لديك ${St.st.pending} تعديل لم يُرفع بعد وسيُفقد عند الخروج. المتابعة؟`, { danger: true, ok: 'خروج على أي حال' }))) return;
  if (!St.st.pending && !(await confirmBox('تسجيل الخروج من هذا الجهاز؟ بياناتك محفوظة في حسابك.', { ok: 'خروج' }))) return;
  await authApi.signOut();
});
on('pw-change', () => openForm({ title: 'تغيير كلمة المرور', fields: [{ name: 'p', label: 'كلمة المرور الجديدة', type: 'password', required: true, autocomplete: 'new-password', validate: v => (v.length < 8 ? '8 أحرف على الأقل' : '') }], onSubmit: async v => { await authApi.changePassword(v.p); toast('تم تغيير كلمة المرور'); } }));
on('rates-save', () => {
  const S = St.S(), base = S.base_currency, rates = { ...S.rates }, vals = {};
  for (const i of $$('[data-rate]')) { const v = parseNum(i.value); if (!(v > 0)) { toast('أدخل أسعاراً صحيحة أكبر من صفر', 'bad'); i.focus(); return; } vals[i.dataset.rate] = v; }
  if (base !== 'USD') rates[base] = vals.USD; rates.USD = 1;
  for (const [c, v] of Object.entries(vals)) if (c !== 'USD') rates[c] = rates[base] / v;
  St.updateSettings({ rates, rates_updated_at: new Date().toISOString(), rates_source: 'manual' }); toast('تم حفظ أسعار الصرف');
});
on('rates-fetch', async (d, el) => { el.disabled = true; try { await St.fetchRates(); toast('تم تحديث أسعار الصرف'); } catch { toast('تعذر التحديث — تحقق من الإنترنت أو أدخل الأسعار يدوياً', 'bad'); } el.disabled = false; });
on('cur-add', () => openForm({ title: 'إضافة عملة', fields: [{ name: 'code', label: 'رمز العملة (3 أحرف)', required: true, placeholder: 'QAR', validate: v => (/^[A-Za-z]{3}$/.test(v) ? '' : '3 أحرف إنجليزية') }, { name: 'name', label: 'الاسم', required: true, placeholder: 'ريال قطري' }, { name: 'symbol', label: 'الرمز المختصر', required: true, placeholder: 'ر.ق', half: true }, { name: 'decimals', label: 'الخانات العشرية', type: 'select', options: [['2', '2'], ['3', '3'], ['0', '0']], required: true, half: true },
  { name: 'rate', label: `كم يساوي 1 منها بـ${St.S().currencies[St.S().base_currency].name}؟`, type: 'number', required: true }],
  onSubmit: v => { const S = St.S(), code = v.code.toUpperCase(); if (CURRENCIES[code]) { toast('العملة موجودة', 'bad'); return false; }
    St.updateSettings({ currencies: { ...(S.row?.currencies || {}), [code]: { name: v.name, symbol: v.symbol, decimals: Number(v.decimals) } }, rates: { ...S.rates, [code]: S.rates[S.base_currency] / v.rate } }); toast('تمت إضافة العملة'); } }));
on('cat-edit', d => {
  const o = d.id ? St.get('categories', d.id) : null;
  openForm({ title: o ? 'تعديل التصنيف' : 'تصنيف جديد', values: o || { icon: '🏷️', color: PALETTE[categories(true).length % PALETTE.length] },
    fields: [{ name: 'name', label: 'اسم التصنيف', required: true, focus: !o }, { name: 'icon', label: 'أيقونة (إيموجي)', half: true }, { name: 'color', label: 'اللون', type: 'color', half: true }, { name: 'archived', label: 'الأرشفة', type: 'toggle', text: 'إخفاء من قوائم الإضافة (العمليات القديمة لا تتأثر)', show: () => !!o }],
    onSubmit: v => { St.put('categories', { ...(o || { sort: categories(true).length }), ...v }); toast('تم الحفظ'); },
    onDelete: o ? async () => { const n = D().transactions.filter(t => t.category_id === o.id).length; if (!(await confirmBox(n ? `حذف «${o.name}»؟ ${n} عملية قديمة ستحتفظ باسم التصنيف كما هو ولن تتغير.` : `حذف «${o.name}»؟`, { ok: 'حذف', danger: true }))) return false; St.remove('categories', o.id); } : null });
});
on('bk-export', () => { download(`mizan-backup-${today()}.json`, JSON.stringify(St.exportBackup()), 'application/json'); toast('تم تنزيل النسخة الاحتياطية'); });
on('bk-import', d => { const f = $('#bk-file'); f.dataset.mode = d.mode; f.click(); });
on('bk-csv', () => exportTxCsv(D().transactions));
on('formulas', () => openSheet('المعادلات والقواعد المالية', `<div class="prose">
  <p><b>صافي التدفق النقدي</b> = الدخل الفعلي − المصروفات الفعلية − الالتزامات المدفوعة (أقساط وديون + اشتراكات جمعيات).</p>
  <p><b>نسبة الادخار</b> = صافي التدفق النقدي ÷ الدخل الفعلي.</p>
  <p><b>لا يُحتسب دخلاً:</b> القرض المستلم، مبلغ الجمعية المستلم، التحويل بين الحسابات، تسوية الرصيد، الدخل «المتوقع».</p>
  <p><b>لا يُحتسب مصروفاً:</b> سداد القسط/الدين (يُحسب مرة واحدة ضمن «الالتزامات المدفوعة»)، اشتراك الجمعية، التحويل، التخصيص لهدف ادخاري.</p>
  <p><b>الدين:</b> المتبقي = الإجمالي − (المدفوع قبل التسجيل + الدفعات). يوزَّع المدفوع على الأقساط الأقدم أولاً؛ القسط غير المسدد بعد تاريخه «متأخر» (أحمر)، والمستحق خلال 7 أيام برتقالي.</p>
  <p><b>الجمعية:</b> مركزي = ما دفعته − ما استلمته. موجب: مستحق لي. سالب: التزام عليّ.</p>
  <p><b>النقد المتاح</b> = كل الأرصدة − المستثمر − المخصص لأهداف. <b>المتاح للإنفاق</b> = النقد المتاح − ما بقي من أقساط وجمعيات ومصروفات متكررة حتى نهاية الشهر.</p>
  <p><b>إجمالي المدخرات</b> = أرصدة حسابات الادخار + الاستثمار + المخصص لأهداف داخل حسابات أخرى.</p>
  <p><b>صافي الثروة</b> = الأرصدة + مستحق الجمعيات − التزام الجمعيات − الديون المتبقية.</p>
  <p><b>الميزانية:</b> أخضر أقل من 75%، أصفر من 75%، برتقالي من 90%، أحمر فوق 100%. تعديل الميزانية يسري من شهره فصاعداً.</p>
  <p><b>العملات:</b> كل عملية تحفظ مبلغها وعملتها وسعر الصرف يوم تسجيلها؛ التدفقات تُحوَّل بسعر يومها والأرصدة بسعر اليوم، والفرق يظهر كـ«فرق أسعار الصرف».</p>
  <p>التفاصيل الكاملة في ملف docs/FORMULAS.md داخل المشروع.</p></div>`));
