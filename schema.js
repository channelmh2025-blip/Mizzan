// تعريف واحد للجداول والأعمدة: يُستخدم في المتصفح (المزامنة) وفي توليد ملف SQL (tools/gen-sql.mjs)
// النوع "uuid>table" يعني مفتاحاً أجنبياً إلى ذلك الجدول.

export const COMMON = {
  id: 'uuid', user_id: 'uuid', created_at: 'timestamptz', updated_at: 'timestamptz', deleted: 'boolean',
};

// الترتيب مهم: الجداول الأب قبل الأبناء (يُستخدم عند الرفع)
export const TABLES = {
  settings: {
    base_currency: 'text', display_currency: 'text', rates: 'jsonb', rates_updated_at: 'timestamptz',
    rates_source: 'text', currencies: 'jsonb', prefs: 'jsonb',
  },
  accounts: {
    name: 'text', type: 'text', currency: 'text', opening_balance: 'numeric', opening_date: 'date',
    archived: 'boolean', sort: 'int', notes: 'text',
  },
  categories: { name: 'text', icon: 'text', color: 'text', archived: 'boolean', sort: 'int' },
  debts: {
    name: 'text', creditor: 'text', kind: 'text', currency: 'text', total: 'numeric', paid_before: 'numeric',
    monthly: 'numeric', start_date: 'date', due_day: 'int', end_date: 'date', notes: 'text',
  },
  jamiyas: {
    name: 'text', type: 'text', currency: 'text', monthly: 'numeric', members: 'int', months: 'int',
    start_date: 'date', pay_day: 'int', my_turn: 'int', payout_amount: 'numeric', status: 'text', notes: 'text',
  },
  goals: {
    name: 'text', type: 'text', currency: 'text', target: 'numeric', target_date: 'date',
    monthly_plan: 'numeric', archived: 'boolean', notes: 'text',
  },
  recurring: {
    kind: 'text', name: 'text', amount: 'numeric', currency: 'text', account_id: 'uuid>accounts',
    category_id: 'uuid>categories', income_type: 'text', payment_method: 'text', day: 'int',
    start_date: 'date', end_date: 'date', active: 'boolean', notes: 'text',
  },
  budgets: { category_id: 'uuid>categories', amount: 'numeric', currency: 'text', effective_from: 'text' },
  transactions: {
    kind: 'text', status: 'text', date: 'date', amount: 'numeric', currency: 'text', rates: 'jsonb',
    account_id: 'uuid>accounts', to_account_id: 'uuid>accounts', to_amount: 'numeric',
    category_id: 'uuid>categories', payment_method: 'text', income_type: 'text', is_fixed: 'boolean',
    description: 'text', notes: 'text', debt_id: 'uuid>debts', jamiya_id: 'uuid>jamiyas',
    goal_id: 'uuid>goals', recurring_id: 'uuid>recurring', period: 'text',
  },
};
export const TABLE_NAMES = Object.keys(TABLES);

export const CURRENCIES = {
  SAR: { name: 'ريال سعودي', symbol: 'ر.س', decimals: 2 },
  EGP: { name: 'جنيه مصري', symbol: 'ج.م', decimals: 2 },
  USD: { name: 'دولار أمريكي', symbol: '$', decimals: 2 },
  AED: { name: 'درهم إماراتي', symbol: 'د.إ', decimals: 2 },
  KWD: { name: 'دينار كويتي', symbol: 'د.ك', decimals: 3 },
  EUR: { name: 'يورو', symbol: '€', decimals: 2 },
};
// أسعار تقريبية مبدئية فقط (وحدات العملة لكل 1 دولار) — تُحدَّث من الإعدادات يدوياً أو آلياً
export const DEFAULT_RATES = { USD: 1, SAR: 3.75, AED: 3.6725, KWD: 0.307, EUR: 0.9, EGP: 48 };

export const DEFAULT_CATEGORIES = [
  ['إيجار السكن', '🏠'], ['الطعام والمواد الغذائية', '🛒'], ['المطاعم والكافيهات', '🍽️'],
  ['المدارس والتعليم', '🎓'], ['المواصلات والبنزين', '⛽'], ['فواتير الكهرباء والمياه', '💡'],
  ['الإنترنت والاتصالات', '📶'], ['العلاج والصحة', '🩺'], ['الملابس', '👕'], ['الأطفال', '🧸'],
  ['الترفيه والرحلات', '🎡'], ['المشتريات المنزلية', '🛋️'], ['الاشتراكات الشهرية', '🔁'],
  ['مصروفات شخصية', '👤'], ['مصروفات أخرى', '📦'],
];
export const PALETTE = ['#0f766e', '#c2410c', '#1d4ed8', '#a16207', '#7e22ce', '#be123c', '#047857', '#0369a1',
  '#b45309', '#4338ca', '#a21caf', '#15803d', '#b91c1c', '#0e7490', '#57534e', '#6d28d9'];

export const INCOME_TYPES = { salary: 'راتب', extra: 'عمل إضافي', bonus: 'مكافأة', project: 'مشروع', investment: 'دخل استثماري', other: 'دخل آخر' };
export const PAY_METHODS = { cash: 'نقداً', card: 'بطاقة بنكية', transfer: 'تحويل بنكي', wallet: 'محفظة إلكترونية' };
export const ACCOUNT_TYPES = { cash: 'كاش', bank: 'حساب بنكي', wallet: 'محفظة إلكترونية', savings: 'حساب ادخار', investment: 'استثمار' };
export const GOAL_TYPES = { emergency: 'صندوق الطوارئ', education: 'مصاريف التعليم', travel: 'السفر', car: 'شراء سيارة', home: 'شراء منزل', invest: 'استثمار', other: 'هدف شخصي آخر' };
export const DEBT_KINDS = { installment: 'قسط (شراء بالتقسيط)', loan: 'قرض / تمويل', personal: 'دين شخصي' };

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
// معرّف ثابت مشتق من نص: يضمن أن البيانات الافتراضية لا تتكرر إذا أُنشئت من جهازين
export function detId(seed) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < seed.length; i++) {
    k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const h = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
}
