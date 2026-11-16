// الإقلاع، تسجيل الدخول، التنقل
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as St from './store.js';
import * as C from './calc.js';
import { $, esc, on, toast, openSheet, closeSheet, moneyT } from './ui.js';
import { app, D, txForm, today } from './tx.js';
import { home, income, expenses, accountsView } from './views1.js';
import { debts, jamiyas, budget, savings, calendar } from './views2.js';
import { reports, settings, setAuthApi } from './views3.js';
import { CURRENCIES } from './schema.js';

const VIEWS = {
  home: ['الرئيسية', home, '⌂'], income: ['الدخل', income, '↙'], expenses: ['المصروفات', expenses, '↗'], debts: ['الأقساط والديون', debts, '▤'],
  jamiyas: ['الجمعيات', jamiyas, '◔'], savings: ['الادخار', savings, '◎'], budget: ['الميزانية', budget, '◫'], accounts: ['الحسابات', accountsView, '▣'],
  calendar: ['التقويم', calendar, '▦'], reports: ['التقارير', reports, '◩'], settings: ['الإعدادات', settings, '⚙'],
};
const CLOUD = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
let sb = null, started = false, starting = false, subbed = false;
const route = () => { const h = location.hash.slice(1); return VIEWS[h] ? h : 'home'; };

function syncBadge() {
  const s = St.st;
  if (!s.cloud) return ['local', 'محلي فقط'];
  if (!navigator.onLine) return ['off', s.pending ? `بلا إنترنت · ${s.pending} بالانتظار` : 'بلا إنترنت'];
  if (s.syncing) return ['busy', 'جارٍ المزامنة…'];
  if (s.syncError) return ['err', 'تعذرت المزامنة'];
  if (s.pending) return ['busy', `${s.pending} بانتظار الرفع`];
  return ['ok', 'متزامن'];
}
function render() {
  if (!started) return;
  const r = route(), [title, fn] = VIEWS[r], view = $('#view'), [bc, bl] = syncBadge();
  $('#sync').className = `sync ${bc}`; $('#sync').innerHTML = `<i></i>${bl}`;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === r || (a.dataset.nav === 'more' && !['home', 'expenses', 'reports'].includes(r))));
  if (!St.st.firstPull) { $('#title').textContent = 'ميزان'; view.innerHTML = `<div class="boot"><div class="spin"></div><p>${St.st.syncError ? `تعذر تحميل بياناتك: ${esc(St.st.syncError)}` : 'جارٍ تحميل بياناتك…'}</p>${St.st.syncError ? '<button class="btn primary" data-a="sync-now">إعادة المحاولة</button>' : ''}</div>`; return; }
  if (St.needsOnboarding()) { $('#title').textContent = 'مرحباً بك'; view.innerHTML = onboardingHtml(); return; }
  $('#title').textContent = title; document.title = `${title} · ميزان`;
  const active = document.activeElement, keep = active && view.contains(active) && active.id ? { id: active.id, s: active.selectionStart } : null;
  view.dataset.view = r; view.innerHTML = fn(); fn.after?.(view);
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch {} } }
}
app.render = render;
addEventListener('hashchange', () => { closeSheet(true); render(); scrollTo(0, 0); });
addEventListener('online', render); addEventListener('offline', render);
addEventListener('online', async () => { // عاد الاتصال والجلسة منتهية: نطلب الدخول دون مسح التعديلات المحلية
  if (!CLOUD || !sb || !started) return;
  try { const { data } = await sb.auth.getSession(); if (!data.session) { started = false; showAuth('in', 'انتهت الجلسة — سجّل الدخول لمتابعة المزامنة. تعديلاتك المحلية محفوظة.'); } } catch {}
});

const onboardingHtml = () => `<section class="card onboard"><h2>لنبدأ بإعداد ميزان</h2><p>اختر عملتك الأساسية. يمكنك تغييرها لاحقاً من الإعدادات دون أن تتأثر بياناتك.</p>
  <div class="chips wrap">${Object.entries(CURRENCIES).map(([k, v]) => `<button class="chip big" data-a="onboard" data-c="${k}">${esc(v.name)} <em>${k}</em></button>`).join('')}</div>
  <p class="hint">سننشئ لك تصنيفات المصروفات الافتراضية وحسابين (كاش وحساب بنكي) يمكنك تعديلهما وإدخال أرصدتهما الحالية من صفحة «الحسابات».</p></section>`;
on('onboard', d => { St.onboard(d.c); toast('تم الإعداد — أدخل أرصدة حساباتك الحالية'); location.hash = '#accounts'; if (navigator.onLine) St.fetchRates().catch(() => {}); });

// الإضافة السريعة: تفتح نموذج المصروف مباشرة (الأكثر استخداماً) مع إمكانية التبديل
const quickIntro = k => `<div class="seg-tabs sm">${[['expense', 'مصروف'], ['income', 'دخل'], ['transfer', 'تحويل']].map(([x, l]) => `<button type="button" class="${x === k ? 'on' : ''}" data-a="quick-add" data-kind="${x}">${l}</button>`).join('')}</div>`;
on('quick-add', d => { const k = d.kind || 'expense'; txForm(k, { intro: quickIntro(k), title: 'إضافة سريعة' }); });
on('more', () => openSheet('كل الصفحات', `<div class="more-grid">${Object.entries(VIEWS).map(([k, [t, , ic]]) => `<a href="#${k}" data-a="sheet-close-nav" data-h="${k}"><i>${ic}</i>${t}</a>`).join('')}</div>`));
on('sheet-close-nav', d => { closeSheet(true); location.hash = `#${d.h}`; });

// إشعار النظام بالمواعيد عند فتح التطبيق (مرة يومياً)
async function notifyDue() {
  try {
    if (localStorage.getItem('mizan-notify') !== '1' || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (localStorage.getItem('mizan-notified') === today() || St.needsOnboarding()) return;
    const a = C.dashboard(D(), St.S(), today(), St.S().display_currency).alerts; if (!a.length) return;
    const late = a.filter(e => e.status === 'overdue').length, body = a.slice(0, 4).map(e => `${e.title}: ${moneyT(e.remaining, e.currency)}`).join('\n');
    const title = late ? `ميزان: ${late} موعد متأخر و${a.length - late} قريب` : `ميزان: ${a.length} موعد مستحق قريباً`;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'ar', tag: 'mizan-due' }); else new Notification(title, { body, dir: 'rtl' });
    localStorage.setItem('mizan-notified', today());
  } catch (e) { console.warn(e); }
}

async function start(uid, email, cloud) {
  if ((started && St.st.uid === uid) || starting) return;
  starting = true;
  $('#auth').hidden = true; $('#app').hidden = false;
  try { await St.init(uid, { cloud, sb: cloud ? sb : null, email }); } finally { starting = false; }
  started = true; if (!subbed) { subbed = true; St.subscribe(render); } render();
  setTimeout(notifyDue, 2500);
  if (navigator.onLine && St.S().row && (!St.S().rates_updated_at || Date.now() - Date.parse(St.S().rates_updated_at) > 7 * 864e5) && St.S().rates_source !== 'manual') St.fetchRates().catch(() => {});
}

// ───── شاشة الدخول ─────
const ERR = { 'Invalid login credentials': 'البريد أو كلمة المرور غير صحيحة', 'Email not confirmed': 'لم يتم تأكيد البريد بعد — افتح رابط التأكيد المرسل إليك', 'User already registered': 'هذا البريد مسجل بالفعل — سجّل الدخول', 'Failed to fetch': 'تعذر الاتصال بالخادم — تحقق من الإنترنت' };
const arErr = e => ERR[e?.message] || (/password/i.test(e?.message || '') ? 'كلمة المرور ضعيفة: استخدم 8 أحرف على الأقل' : /rate limit/i.test(e?.message || '') ? 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة' : e?.message || 'حدث خطأ');
function showAuth(mode = 'in', msg = '') {
  started = false; $('#app').hidden = true; const a = $('#auth'); a.hidden = false;
  const T = { in: ['تسجيل الدخول', 'دخول'], up: ['إنشاء حساب جديد', 'إنشاء الحساب'], reset: ['استعادة كلمة المرور', 'إرسال رابط الاستعادة'], newpw: ['كلمة مرور جديدة', 'حفظ كلمة المرور'] }[mode];
  a.innerHTML = `<div class="auth-box"><img src="icon.svg" alt="" width="72" height="72"><h1>ميزان</h1><p class="tag-line">إدارة مالية شخصية وعائلية</p>
    <form id="auth-form" class="form" novalidate><h2>${T[0]}</h2>
    ${mode !== 'newpw' ? '<div class="f"><label class="lbl" for="au-e">البريد الإلكتروني</label><input id="au-e" type="email" dir="ltr" autocomplete="email" required></div>' : ''}
    ${mode !== 'reset' ? `<div class="f"><label class="lbl" for="au-p">كلمة المرور</label><input id="au-p" type="password" dir="ltr" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" minlength="8" required>${mode !== 'in' ? '<p class="hint">8 أحرف على الأقل.</p>' : ''}</div>` : ''}
    <p class="err" id="au-err" ${msg ? '' : 'hidden'}>${esc(msg)}</p><button class="btn primary grow" type="submit">${T[1]}</button></form>
    <div class="auth-links">${mode === 'in' ? '<button data-a="auth-mode" data-m="up">إنشاء حساب جديد</button><button data-a="auth-mode" data-m="reset">نسيت كلمة المرور؟</button>' : mode === 'newpw' ? '' : '<button data-a="auth-mode" data-m="in">لدي حساب — تسجيل الدخول</button>'}</div>
    <p class="hint center">بياناتك محفوظة في قاعدة بيانات خاصة بحسابك، ولا يمكن لأي مستخدم آخر الوصول إليها.</p></div>`;
  $('#auth-form').addEventListener('submit', async e => {
    e.preventDefault(); const email = $('#au-e')?.value.trim(), pw = $('#au-p')?.value, err = $('#au-err'), btn = e.target.querySelector('button[type=submit]');
    const say = (m, ok = false) => { err.textContent = m; err.hidden = false; err.classList.toggle('ok', ok); };
    if (mode !== 'newpw' && !/^\S+@\S+\.\S+$/.test(email || '')) return say('أدخل بريداً إلكترونياً صحيحاً');
    if (mode !== 'reset' && (pw || '').length < 8) return say('كلمة المرور 8 أحرف على الأقل');
    btn.disabled = true; const redirect = location.origin + location.pathname;
    try {
      if (mode === 'in') { const { error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; }
      else if (mode === 'up') { const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirect } }); if (error) throw error; if (!data.session) say('تم إنشاء الحساب. افتح رابط التأكيد المرسل إلى بريدك ثم سجّل الدخول.', true); }
      else if (mode === 'reset') { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect }); if (error) throw error; say('أرسلنا رابط استعادة كلمة المرور إلى بريدك.', true); }
      else { const { data, error } = await sb.auth.updateUser({ password: pw }); if (error) throw error; toast('تم حفظ كلمة المرور'); start(data.user.id, data.user.email, true); }
    } catch (er) { say(arErr(er)); } finally { btn.disabled = false; }
  });
}
on('auth-mode', d => showAuth(d.m));

async function boot() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn('sw', e));
  if (!CLOUD) return start('local', null, false);
  const last = JSON.parse(localStorage.getItem('mizan-last') || 'null');
  if (!window.supabase) { // لم تُحمَّل مكتبة الاتصال (أول فتح بلا إنترنت)
    if (last) return start(last.uid, last.email, true);
    $('#auth').hidden = false; $('#auth').innerHTML = '<div class="auth-box"><h1>ميزان</h1><p>تعذر الاتصال. تحقق من الإنترنت ثم أعد فتح التطبيق.</p><button class="btn primary" onclick="location.reload()">إعادة المحاولة</button></div>'; return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  setAuthApi({
    signOut: async () => { await St.close({ wipe: true }); localStorage.removeItem('mizan-last'); await sb.auth.signOut().catch(() => {}); started = false; showAuth('in'); },
    changePassword: async p => { const { error } = await sb.auth.updateUser({ password: p }); if (error) throw new Error(arErr(error)); },
  });
  let recovery = false;
  sb.auth.onAuthStateChange((ev, session) => setTimeout(() => {
    if (ev === 'PASSWORD_RECOVERY') { recovery = true; showAuth('newpw'); }
    else if (ev === 'SIGNED_IN' && session && !recovery && !started) { localStorage.setItem('mizan-last', JSON.stringify({ uid: session.user.id, email: session.user.email })); start(session.user.id, session.user.email, true); }
    else if (ev === 'SIGNED_OUT' && started) { started = false; showAuth('in'); }
    else if (ev === 'TOKEN_REFRESHED') St.scheduleSync(200);
  }, 0));
  let session = null;
  try { session = (await sb.auth.getSession()).data.session; } catch (e) { console.warn(e); }
  if (recovery) return;
  if (session) { localStorage.setItem('mizan-last', JSON.stringify({ uid: session.user.id, email: session.user.email })); return start(session.user.id, session.user.email, true); }
  if (!navigator.onLine && last) return start(last.uid, last.email, true); // جلسة منتهية وبلا إنترنت: نعمل من النسخة المحلية حتى يعود الاتصال
  showAuth('in');
}
boot();
