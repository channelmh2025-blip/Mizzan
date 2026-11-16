// العمليات المالية: التسميات، نموذج الإدخال الموحد، وعرض القوائم
import * as St from './store.js';
import * as C from './calc.js';
import { esc, money, moneyT, fmtDate, dayName, openForm, toast, confirmBox, on, empty } from './ui.js';
import { INCOME_TYPES, PAY_METHODS, ACCOUNT_TYPES } from './schema.js';

export const app = { render() {}, go() {} };
export const D = () => St.db();
export const dcur = () => St.S().display_currency;
export const today = () => C.todayStr();
export const KIND = {
  income: { label: 'دخل', icon: '↙', cls: 'pos', sign: 1 }, expense: { label: 'مصروف', icon: '↗', cls: 'neg', sign: -1 },
  transfer: { label: 'تحويل بين الحسابات', icon: '⇄', cls: 'neu', sign: 0 },
  debt_payment: { label: 'سداد قسط / دين', icon: '▤', cls: 'neg', sign: -1 }, debt_received: { label: 'قرض مستلم (ليس دخلاً)', icon: '▤', cls: 'neu', sign: 1 },
  jamiya_payment: { label: 'اشتراك جمعية', icon: '◔', cls: 'neg', sign: -1 }, jamiya_payout: { label: 'استلام جمعية (ليس دخلاً)', icon: '◔', cls: 'neu', sign: 1 },
  goal_alloc: { label: 'تخصيص لهدف ادخاري', icon: '◎', cls: 'neu', sign: 0 }, goal_withdraw: { label: 'سحب من هدف ادخاري', icon: '◎', cls: 'neu', sign: 0 },
  adjust: { label: 'تسوية رصيد', icon: '≈', cls: 'neu', sign: 1 },
};
export const accounts = (all = false) => D().accounts.filter(a => all || !a.archived).sort((a, b) => (a.sort ?? 99) - (b.sort ?? 99));
export const accName = id => St.getAny('accounts', id)?.name || '—';
export const accOptions = () => accounts().map(a => [a.id, `${a.name} · ${a.currency}`]);
export const categories = (all = false) => D().categories.filter(c => all || !c.archived).sort((a, b) => (a.sort ?? 99) - (b.sort ?? 99));
export const catOf = id => St.getAny('categories', id) || { name: 'بدون تصنيف', icon: '•', color: '#78716c' };
export const curOptions = () => Object.entries(St.S().currencies).map(([k, v]) => [k, `${v.name} (${k})`]);
export const convNow = (v, from, to = dcur()) => { const r = C.conv(v, from, to, St.S().rates); return Number.isNaN(r) ? 0 : r; };

export function txTitle(t) {
  if (t.description) return t.description;
  switch (t.kind) {
    case 'expense': return catOf(t.category_id).name;
    case 'income': return INCOME_TYPES[t.income_type] || 'دخل';
    case 'transfer': return `${accName(t.account_id)} ← ${accName(t.to_account_id)}`;
    case 'debt_payment': case 'debt_received': return St.getAny('debts', t.debt_id)?.name || KIND[t.kind].label;
    case 'jamiya_payment': case 'jamiya_payout': return St.getAny('jamiyas', t.jamiya_id)?.name || KIND[t.kind].label;
    case 'goal_alloc': case 'goal_withdraw': return St.getAny('goals', t.goal_id)?.name || KIND[t.kind].label;
    default: return KIND[t.kind]?.label || t.kind;
  }
}
export function txSub(t) {
  const p = [];
  if (t.kind === 'expense') { if (t.description) p.push(catOf(t.category_id).name); if (t.payment_method) p.push(PAY_METHODS[t.payment_method]); }
  else if (t.kind === 'income') p.push(INCOME_TYPES[t.income_type] || 'دخل', t.is_fixed ? 'ثابت' : 'متغير');
  else p.push(KIND[t.kind]?.label || '');
  if (t.kind !== 'transfer' && t.account_id) p.push(accName(t.account_id));
  return p.filter(Boolean).join(' · ');
}
export function txRow(t, { showDate = false } = {}) {
  const k = KIND[t.kind] || KIND.adjust, exp = t.status === 'expected', v = Number(t.amount) || 0;
  const sign = t.kind === 'adjust' ? '' : k.sign > 0 ? '+' : k.sign < 0 ? '−' : '';
  const cat = t.kind === 'expense' ? catOf(t.category_id) : null;
  const other = t.currency !== dcur() ? `<small>≈ ${moneyT(C.convTx(t, Math.abs(v), t.currency, dcur(), St.S()))}</small>` : '';
  return `<button class="tx ${exp ? 'expected' : ''}" data-a="tx-edit" data-id="${t.id}">
    <span class="tx-ic ${k.cls}" ${cat ? `style="background:${cat.color}1f;color:${cat.color}"` : ''}>${cat ? esc(cat.icon || '•') : k.icon}</span>
    <span class="tx-main"><b>${esc(txTitle(t))}</b><small>${esc(txSub(t))}${showDate ? ` · ${fmtDate(t.date)}` : ''}${exp ? ' · <em class="tag">متوقع</em>' : ''}</small></span>
    <span class="tx-amt ${k.cls}"><span dir="ltr">${sign}</span>${money(t.kind === 'adjust' ? v : Math.abs(v), t.currency)}${other}</span></button>`;
}
export function txList(txs, { limit = 300, showDate = false, group = true } = {}) {
  if (!txs.length) return empty('لا توجد عمليات مطابقة');
  const sorted = [...txs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.created_at || '').localeCompare(a.created_at || '')));
  const shown = sorted.slice(0, limit); let html = '', last = '';
  for (const t of shown) {
    if (group && t.date !== last) { last = t.date; html += `<h4 class="day">${dayName(t.date)}، ${fmtDate(t.date)}</h4>`; }
    html += txRow(t, { showDate: showDate && !group });
  }
  if (sorted.length > limit) html += `<p class="hint center">يُعرض أحدث ${limit} عملية من ${sorted.length}. استخدم البحث أو الفلترة لتضييق النتائج.</p>`;
  return `<div class="tx-list">${html}</div>`;
}

// ───── نموذج العملية ─────
const defAccount = () => { const a = accounts(); return (a.find(x => x.id === St.S().prefs.lastAccount) || a[0])?.id || ''; };
export function txForm(kind, { id = null, preset = {}, title = null, after = null, intro = '' } = {}) {
  const old = id ? St.get('transactions', id) : null; if (old) kind = old.kind;
  if (!accounts().length && kind !== 'goal_alloc') { toast('أضف حساباً أولاً من صفحة الحسابات', 'bad'); return; }
  const accId = old?.account_id ?? preset.account_id ?? defAccount(), acc = St.get('accounts', accId);
  const v = { date: today(), currency: acc?.currency || St.S().base_currency, account_id: accId, payment_method: St.S().prefs.lastMethod || 'card', status: 'actual', is_fixed: 'var', income_type: 'salary', ...preset, ...(old || {}) };
  if (old) v.is_fixed = old.is_fixed ? 'fixed' : 'var';
  if (kind === 'adjust' && old) v.amount = old.amount;
  const F = [], amount = { name: 'amount', label: 'المبلغ', type: 'number', required: true, big: true, half: true, focus: !old, allowNegative: kind === 'adjust' };
  const currency = { name: 'currency', label: 'العملة', type: 'select', options: curOptions(), required: true, half: true };
  const date = { name: 'date', label: kind === 'income' ? 'تاريخ الاستلام' : 'التاريخ', type: 'date', required: true, half: true };
  const account = (label, name = 'account_id', required = true) => ({ name, label, type: 'select', options: accOptions(), required, half: true });
  const notes = { name: 'notes', label: 'ملاحظات', type: 'textarea' };
  switch (kind) {
    case 'expense':
      F.push(amount, currency, { name: 'category_id', label: 'التصنيف', type: 'chips', required: true, options: categories().concat(old && !categories().some(c => c.id === old.category_id) && St.getAny('categories', old.category_id) ? [St.getAny('categories', old.category_id)] : []).map(c => [c.id, c.name, c.icon]) },
        date, account('من حساب'), { name: 'payment_method', label: 'طريقة الدفع', type: 'select', options: Object.entries(PAY_METHODS), required: true },
        { name: 'description', label: 'وصف المصروف', placeholder: 'مثال: مشتريات السوبرماركت' }, notes);
      break;
    case 'income':
      F.push({ name: 'description', label: 'اسم مصدر الدخل', required: true, placeholder: 'مثال: راتب الشركة' }, { name: 'income_type', label: 'نوع الدخل', type: 'select', options: Object.entries(INCOME_TYPES), required: true },
        amount, currency, date, account('إلى حساب'),
        { name: 'is_fixed', label: 'طبيعة الدخل', type: 'seg', options: [['fixed', 'شهري ثابت'], ['var', 'متغير']], required: true },
        { name: 'status', label: 'الحالة', type: 'seg', options: [['actual', 'مستلم فعلاً'], ['expected', 'متوقع']], required: true, hint: 'الدخل المتوقع لا يدخل في الأرصدة ولا في التدفق النقدي حتى تؤكد استلامه.' }, notes);
      break;
    case 'transfer':
      F.push(amount, currency, account('من حساب'), account('إلى حساب', 'to_account_id'),
        { name: 'to_amount', label: 'المبلغ الواصل فعلياً بعملة الحساب المستلم', type: 'number', hint: 'اتركه فارغاً ليُحسب بسعر الصرف الحالي.', show: x => St.get('accounts', x.to_account_id)?.currency !== x.currency },
        date, notes);
      break;
    case 'goal_alloc': case 'goal_withdraw':
      F.push(amount, currency, date,
        { ...account(kind === 'goal_alloc' ? 'من حساب' : 'من حساب (حيث المبلغ محفوظ)', 'account_id', false) },
        { ...account('إلى حساب', 'to_account_id', false), hint: kind === 'goal_alloc' ? 'اختياري: إن اخترت حسابين مختلفين يُنقل المبلغ بينهما (ليس مصروفاً). وإن تركته فهو تخصيص داخل نفس الحساب.' : 'اختياري: لنقل المبلغ إلى حساب آخر عند السحب.' }, notes);
      break;
    case 'adjust': F.push({ ...amount, label: 'فرق الرصيد (موجب أو سالب)' }, currency, date, account('الحساب'), notes); break;
    default: // debt_payment, debt_received, jamiya_payment, jamiya_payout
      F.push(amount, currency, date, account(KIND[kind].sign > 0 ? 'إلى حساب' : 'من حساب'), notes);
  }
  const hasFx = () => Object.keys(St.S().currencies).length > 1;
  if (!hasFx()) F.splice(F.indexOf(currency), 1);
  openForm({
    title: title || (old ? `تعديل: ${KIND[kind].label}` : KIND[kind].label), fields: F, values: v, intro, submit: old ? 'حفظ التعديل' : 'حفظ',
    onChange: (x, form, name) => { if (name === 'account_id' && !old && form.elements.currency) { const a = St.get('accounts', x.account_id); if (a) { form.elements.currency.value = a.currency; form.dispatchEvent(new Event('input')); } } },
    onSubmit: x => {
      if ((kind === 'transfer') && x.account_id === x.to_account_id) { toast('اختر حسابين مختلفين', 'bad'); return false; }
      const row = { ...(old || {}), ...preset, ...x, kind, currency: x.currency || v.currency };
      if (kind === 'income') row.is_fixed = x.is_fixed === 'fixed'; else { row.status = 'actual'; row.is_fixed = false; }
      if (kind === 'transfer' && x.to_amount === '') row.to_amount = null;
      // سعر الصرف يُحفظ مرة واحدة عند التسجيل ولا يتغير بعدها (إلا إذا تغيّر تاريخ/عملة العملية وهي بلا سعر)
      row.rates = old?.rates && old.currency === row.currency ? old.rates : { ...St.S().rates };
      St.put('transactions', row);
      if (!old) { const p = { ...St.S().prefs }; if (x.account_id) p.lastAccount = x.account_id; if (x.payment_method) p.lastMethod = x.payment_method; if (St.S().row) St.updateSettings({ prefs: p }); }
      toast(old ? 'تم حفظ التعديل' : 'تمت الإضافة');
    },
    onDelete: old ? async () => { if (!(await confirmBox('حذف هذه العملية نهائياً؟', { ok: 'حذف', danger: true }))) return false; St.remove('transactions', old.id); toast('تم الحذف'); } : null,
    onClose: after,
  });
}
on('tx-edit', d => txForm(null, { id: d.id }));
on('tx-add', d => txForm(d.kind));

// تسجيل موعد مستحق (من التقويم/التنبيهات)
export function payOccurrence(ref, after) {
  if (ref.table === 'recurring') {
    const r = St.get('recurring', ref.id); if (!r) return;
    txForm(r.kind, { after, preset: { amount: r.amount, currency: r.currency, account_id: r.account_id || undefined, category_id: r.category_id, description: r.name, income_type: r.income_type || 'salary', is_fixed: 'fixed', payment_method: r.payment_method || 'transfer', recurring_id: r.id, period: ref.period }, title: `تسجيل: ${r.name}` });
  } else if (ref.table === 'debts') {
    const d = St.get('debts', ref.id); if (!d) return; const s = C.debtState(d, D(), St.S(), today());
    txForm('debt_payment', { after, preset: { debt_id: d.id, currency: d.currency, amount: s.next ? s.next.remaining : s.remaining }, title: `دفعة: ${d.name}` });
  } else if (ref.table === 'jamiyas') {
    const j = St.get('jamiyas', ref.id); if (!j) return; const s = C.jamiyaState(j, D(), St.S(), today());
    if (ref.payout) txForm('jamiya_payout', { after, preset: { jamiya_id: j.id, currency: j.currency, amount: Math.max(0, s.expectedPayout - s.received) }, title: `استلام: ${j.name}` });
    else txForm('jamiya_payment', { after, preset: { jamiya_id: j.id, currency: j.currency, amount: s.next ? s.next.remaining : j.monthly }, title: `اشتراك: ${j.name}` });
  } else if (ref.table === 'transactions') {
    const t = St.get('transactions', ref.id); if (!t) return;
    St.put('transactions', { ...t, status: 'actual', date: today() }); toast('تم تأكيد استلام الدخل'); after?.();
  }
}
on('occ-pay', d => payOccurrence({ table: d.t, id: d.id, period: d.period, payout: d.payout === '1' }));

export const STATUS = { overdue: ['متأخر', 'red'], today: ['اليوم', 'orange'], d3: ['خلال 3 أيام', 'orange'], d7: ['خلال 7 أيام', 'orange'], upcoming: ['قادم', 'gray'], paid: ['مدفوع', 'green'] };
const EV = { income: ['دخل', '↙'], expense: ['مصروف متكرر', '↗'], debt: ['قسط', '▤'], jamiya: ['جمعية', '◔'], payout: ['استلام جمعية', '◔'] };
export function eventRow(e) {
  const [lbl, col] = STATUS[e.status] || STATUS.upcoming, inflow = e.type === 'income' || e.type === 'payout';
  const stLbl = e.paid ? (inflow ? 'مستلم' : 'مدفوع') : (e.status === 'overdue' && inflow ? 'تأخر استلامه' : lbl);
  return `<div class="ev ${col}"><span class="tx-ic ${inflow ? 'pos' : 'neg'}">${EV[e.type][1]}</span>
    <span class="tx-main"><b>${esc(e.title)}</b><small>${EV[e.type][0]} · ${fmtDate(e.date)} · <em class="badge ${col}">${stLbl}</em></small></span>
    <span class="tx-amt">${money(e.paid ? e.amount : e.remaining, e.currency)}${e.paid ? '' : `<button class="btn tiny" data-a="occ-pay" data-t="${e.ref.table}" data-id="${e.ref.id}" data-period="${e.ref.period || ''}" data-payout="${e.ref.payout ? 1 : 0}">${inflow ? 'تسجيل الاستلام' : 'تسجيل الدفع'}</button>`}</span></div>`;
}
export const kv = (k, v, cls = '') => `<div class="kv ${cls}"><span>${k}</span><b>${v}</b></div>`;
export const accTypeName = t => ACCOUNT_TYPES[t] || t;
