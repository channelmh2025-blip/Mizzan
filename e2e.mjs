// اختبار واجهة شامل (اختياري): يشغّل التطبيق في الوضع المحلي داخل متصفح حقيقي ويتحقق من الأرقام.
// التشغيل: python3 -m http.server 8080  ثم  node tests/e2e.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const URL_ = process.env.APP_URL || 'http://localhost:8080/', SHOTS = process.env.SHOTS || '';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ar' });
const page = await ctx.newPage(); const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
const shot = async n => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); };
const txt = sel => page.locator(sel).first().innerText();
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(150); };
const save = async () => { await page.click('#sheet button[type=submit]'); await page.waitForTimeout(200); };

await page.goto(URL_); await page.waitForSelector('.onboard');
await page.click('[data-a=onboard][data-c=SAR]'); await page.waitForSelector('[data-a=acc-open]');

// 1) رصيد افتتاحي عبر الواجهة
await page.locator('[data-a=acc-open]').nth(1).click(); await page.click('#sheet [data-a=acc-edit]');
await page.fill('#f_opening_balance', '5000'); await save();
assert.match(await txt('.hero strong'), /5,000\.00/);

// 2) إضافة مصروف سريع عبر الزر العائم (يجب أن تكفي 3 خطوات: مبلغ، تصنيف، حفظ)
await go('#home'); await page.click('#tabs .fab');
await page.fill('#f_amount', '١٥٠٫٥'); // أرقام عربية
await page.locator('#sheet .chips label').nth(1).click(); await save();
await go('#expenses'); assert.match(await txt('.stats .stat:nth-child(1) b'), /150\.50/);
await shot('02-expenses');

// 3) بقية البيانات تُدخل برمجياً عبر نفس واجهة التخزين التي تستخدمها النماذج
const T = await page.evaluate(async () => {
  const St = await import('./js/store.js'), C = await import('./js/calc.js');
  const t = C.todayStr(), ym = C.ymOf(t), R = { ...St.S().rates }, d = n => C.addDays(t, n);
  const [cash, bank] = St.db().accounts.sort((a, b) => a.sort - b.sort), cats = St.db().categories.sort((a, b) => a.sort - b.sort);
  const sav = St.put('accounts', { name: 'حساب الادخار', type: 'savings', currency: 'SAR', opening_balance: 0, opening_date: t, sort: 2 });
  const usd = St.put('accounts', { name: 'محفظة دولار', type: 'wallet', currency: 'USD', opening_balance: 200, opening_date: t, sort: 3 });
  const tx = (kind, date, amount, o = {}) => St.put('transactions', { kind, date, amount, currency: 'SAR', status: 'actual', rates: R, account_id: bank.id, ...o });
  tx('income', C.monthStart(ym), 12000, { description: 'راتب الشركة', income_type: 'salary', is_fixed: true });
  tx('expense', t, 3000, { category_id: cats[0].id, payment_method: 'transfer' });
  tx('expense', t, 40, { currency: 'USD', account_id: usd.id, category_id: cats[12].id, payment_method: 'card', description: 'اشتراك' });
  tx('transfer', t, 1000, { to_account_id: sav.id });
  const debt = St.put('debts', { name: 'قسط السيارة', creditor: 'البنك', kind: 'installment', currency: 'SAR', total: 24000, paid_before: 0, monthly: 2000, start_date: d(-40), due_day: Number(d(-40).slice(8)) });
  tx('debt_payment', d(-40), 2000, { debt_id: debt.id });
  const jam = St.put('jamiyas', { name: 'جمعية الأهل', type: 'paying', currency: 'SAR', monthly: 1000, members: 10, months: 10, start_date: d(3), pay_day: Number(d(3).slice(8)), my_turn: 4 });
  const goal = St.put('goals', { name: 'صندوق الطوارئ', type: 'emergency', currency: 'SAR', target: 10000, monthly_plan: 1000 });
  tx('goal_alloc', t, 1000, { account_id: sav.id, goal_id: goal.id, to_account_id: null });
  St.put('budgets', { category_id: cats[1].id, amount: 160, currency: 'SAR', effective_from: ym });
  St.put('budgets', { category_id: cats[0].id, amount: 2500, currency: 'SAR', effective_from: ym });
  St.put('recurring', { kind: 'expense', name: 'فاتورة الإنترنت', amount: 300, currency: 'SAR', day: Number(d(2).slice(8)), category_id: cats[6].id, account_id: bank.id, start_date: C.monthStart(ym), active: true });
  await new Promise(r => setTimeout(r, 300));
  return { t, month2: ym !== C.ymOf(d(-40)), sameMonthBill: C.ymOf(d(2)) === ym, sameMonthJam: C.ymOf(d(3)) === ym };
});

// 4) كل الصفحات تُعرض بلا أخطاء + لقطات
for (const v of ['home', 'income', 'expenses', 'debts', 'jamiyas', 'savings', 'budget', 'accounts', 'calendar', 'reports', 'settings']) {
  await go('#' + v); await page.waitForTimeout(120); assert.equal(await page.locator('#view').getAttribute('data-view'), v); await shot(`v-${v}`);
}
// 5) أرقام اللوحة: دخل 12000، مصروف 150.5+3000+150 (40$ × 3.75)
await go('#home');
const stats = await page.locator('.stats .stat > b').allInnerTexts();
assert.match(stats[0], /12,000\.00/); assert.match(stats[1], /3,300\.50/);
assert.match(stats[4], /22,000\.00/); // الدين المتبقي
// 6) القسط الثاني متأخر (استحق قبل ~10 أيام) ويظهر بالأحمر، ثم يُسدد من الواجهة
await go('#debts'); assert.ok(await page.locator('.item.red').count() === 1, 'الدين المتأخر يجب أن يظهر بالأحمر');
await page.click('[data-a=debt-open]'); assert.ok(await page.locator('.sched tr.red').count() >= 1); await shot('debt-detail');
await page.click('#sheet [data-a=debt-pay]'); assert.equal(await page.inputValue('#f_amount'), '2000'); await save();
await page.waitForSelector('#sheet .kvs'); // يعود لتفاصيل الدين
await page.keyboard.press('Escape'); await go('#home'); await go('#debts');
assert.equal(await page.locator('.item.red').count(), 0);
// 7) الميزانية: 150.5 من 160 = 94% برتقالي ؛ 3000 من 2500 = أحمر
await go('#budget'); const badges = await page.locator('.btn-row .badge').evaluateAll(els => els.map(e => e.className));
assert.ok(badges.some(b => b.includes('orange')) && badges.some(b => b.includes('red')), 'ألوان الميزانية');
// 8) الادخار: التخصيص ليس مصروفاً والتحويل لا يغيّر الإجمالي
await go('#savings'); assert.match(await txt('.hero strong'), /1,000\.00/);
// 9) تغيير عملة العرض لا يغيّر القيم الأصلية
const before = await page.evaluate(async () => JSON.stringify((await import('./js/store.js')).db().transactions.map(t => [t.amount, t.currency]).sort()));
await go('#settings'); await page.selectOption('#set-disp', 'USD'); await page.waitForTimeout(200); await go('#home');
assert.match((await page.locator('.stats .stat > b').allInnerTexts())[0], /3,200\.00/); // 12000 ÷ 3.75
assert.equal(before, await page.evaluate(async () => JSON.stringify((await import('./js/store.js')).db().transactions.map(t => [t.amount, t.currency]).sort())));
await go('#settings'); await page.selectOption('#set-disp', 'SAR');
// 10) النسخ الاحتياطي: تصدير ثم استبدال يعيد نفس البيانات، والبيانات تبقى بعد إعادة التحميل (IndexedDB)
const n1 = await page.evaluate(async () => { const St = await import('./js/store.js'); const b = JSON.parse(JSON.stringify(St.exportBackup())); St.remove('transactions', St.db().transactions[0].id); St.importBackup(b, 'replace'); await new Promise(r => setTimeout(r, 300)); return St.db().transactions.length; });
await page.reload(); await page.waitForSelector('#view[data-view]');
const n2 = await page.evaluate(async () => (await import('./js/store.js')).db().transactions.length);
assert.equal(n1, n2); assert.ok(n2 >= 8);
// 11) سطح المكتب
await page.setViewportSize({ width: 1280, height: 900 }); await go('#home'); await page.waitForTimeout(200); await shot('desktop-home'); await go('#reports'); await shot('desktop-reports');
assert.deepEqual(errors, [], 'أخطاء في المتصفح:\n' + errors.join('\n'));
console.log('E2E OK —', T, 'transactions:', n2);
await browser.close();
