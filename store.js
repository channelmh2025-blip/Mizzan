// التخزين والمزامنة:
//  - المصدر الأساسي للبيانات: قاعدة Supabase (Postgres) المحمية بـ RLS.
//  - IndexedDB نسخة محلية للعمل بلا إنترنت + "صندوق صادر" للتعديلات التي لم تُرفع بعد.
//  - التعارض: آخر تعديل يفوز على مستوى الصف (updated_at)، ويُحسم في الخادم بدالة mizan_touch.
import { TABLES, TABLE_NAMES, COMMON, uuid, detId, DEFAULT_CATEGORIES, DEFAULT_RATES, CURRENCIES, PALETTE } from './schema.js';

export const st = { uid: null, email: null, cloud: false, sb: null, syncing: false, pending: 0, lastSync: null, syncError: null, firstPull: false, persist: true };
const mem = {}; let idb = null, outbox = new Map(), meta = {}, cache = null, writeQ = Promise.resolve();
const listeners = new Set();
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
let notifyT = null;
function notify() { cache = null; st.pending = outbox.size; clearTimeout(notifyT); notifyT = setTimeout(() => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }), 0); }
const ts = s => (s ? Date.parse(s) : 0);

// ───── IndexedDB ─────
const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function openDb(name) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const t of TABLE_NAMES) d.createObjectStore(t, { keyPath: 'id' });
      d.createObjectStore('outbox', { keyPath: 'key' }); d.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function write(fn, stores) {
  if (!idb) return;
  writeQ = writeQ.then(() => new Promise(res => {
    try { const t = idb.transaction(stores, 'readwrite'); fn(t); t.oncomplete = res; t.onerror = t.onabort = () => { console.error('idb', t.error); res(); }; }
    catch (e) { console.error(e); res(); }
  }));
}
function metaSet(k, v) { meta[k] = v; write(t => t.objectStore('meta').put({ k, v }), ['meta']); }

export async function init(uid, { cloud = false, sb = null, email = null } = {}) {
  Object.assign(st, { uid, cloud, sb, email, syncError: null });
  for (const t of TABLE_NAMES) mem[t] = new Map();
  outbox = new Map(); meta = {};
  try {
    idb = await openDb(`mizan-${uid}`);
    const t = idb.transaction([...TABLE_NAMES, 'outbox', 'meta'], 'readonly');
    const loads = TABLE_NAMES.map(n => rq(t.objectStore(n).getAll()).then(rows => rows.forEach(r => mem[n].set(r.id, r))));
    loads.push(rq(t.objectStore('outbox').getAll()).then(rows => rows.forEach(o => outbox.set(o.key, o))));
    loads.push(rq(t.objectStore('meta').getAll()).then(rows => rows.forEach(m => { meta[m.k] = m.v; })));
    await Promise.all(loads);
    navigator.storage?.persist?.().catch(() => {});
  } catch (e) { console.warn('IndexedDB غير متاح', e); idb = null; st.persist = false; }
  st.lastSync = meta.lastSync || null; st.firstPull = !cloud || !!meta.firstPull;
  notify();
  if (cloud) { listenRemote(); sync(); }
}

// ───── القراءة ─────
export function db() {
  if (cache) return cache;
  cache = {};
  for (const t of TABLE_NAMES) cache[t] = [...mem[t].values()].filter(r => !r.deleted);
  const s = cache.settings[0] || null;
  cache.S = {
    row: s, base_currency: s?.base_currency || 'SAR', display_currency: s?.display_currency || s?.base_currency || 'SAR',
    rates: { ...DEFAULT_RATES, ...(s?.rates || {}) }, currencies: { ...CURRENCIES, ...(s?.currencies || {}) },
    prefs: s?.prefs || {}, rates_updated_at: s?.rates_updated_at || null, rates_source: s?.rates_source || null,
  };
  return cache;
}
export const S = () => db().S;
export const get = (table, id) => { const r = mem[table]?.get(id); return r && !r.deleted ? r : null; };
export const getAny = (table, id) => mem[table]?.get(id) || null; // يشمل المحذوف (لعرض أسماء العمليات القديمة)
export const needsOnboarding = () => st.firstPull && !db().settings.length;

// ───── الكتابة ─────
function clean(table, row) {
  const out = {};
  for (const [k, type] of Object.entries({ ...COMMON, ...TABLES[table] })) {
    let v = row[k]; const t = type.split('>')[0];
    if (v === undefined || v === '') v = null;
    if (v != null) {
      if (t === 'numeric') { v = Number(v); if (!Number.isFinite(v)) v = null; }
      else if (t === 'int') { v = parseInt(v, 10); if (!Number.isFinite(v)) v = null; }
      else if (t === 'boolean') v = v === true || v === 'true' || v === 1;
    }
    if (t === 'boolean' && v == null) v = false;
    out[k] = v;
  }
  return out;
}
export function putMany(table, objs) {
  const now = new Date().toISOString(), rows = [];
  for (const o of objs) {
    const old = o.id ? mem[table].get(o.id) : null;
    const row = clean(table, { ...(old || {}), ...o, id: o.id || uuid(), user_id: st.uid, created_at: old?.created_at || o.created_at || now, updated_at: now, deleted: o.deleted ?? false });
    mem[table].set(row.id, row); rows.push(row);
    outbox.set(`${table}:${row.id}`, { key: `${table}:${row.id}`, table, id: row.id });
  }
  write(t => { for (const r of rows) { t.objectStore(table).put(r); t.objectStore('outbox').put({ key: `${table}:${r.id}`, table, id: r.id }); } }, [table, 'outbox']);
  notify(); scheduleSync(800);
  return rows;
}
export const put = (table, obj) => putMany(table, [obj])[0];
export const remove = (table, id) => put(table, { id, deleted: true });
export function updateSettings(patch) {
  const cur = db().settings[0];
  return put('settings', { ...(cur || { id: st.cloud ? st.uid : detId('settings-local') }), ...patch });
}
export function setPref(k, v) { updateSettings({ prefs: { ...S().prefs, [k]: v } }); }

// البيانات الافتراضية بمعرّفات ثابتة: لو أُنشئت من جهازين لا تتكرر
export function onboard(baseCurrency) {
  const u = st.uid;
  put('settings', { id: st.cloud ? u : detId('settings-local'), base_currency: baseCurrency, display_currency: baseCurrency, rates: DEFAULT_RATES, rates_updated_at: null, rates_source: 'default', currencies: {}, prefs: {} });
  putMany('categories', DEFAULT_CATEGORIES.map(([name, icon], i) => ({ id: detId(`${u}:cat:${i}`), name, icon, color: PALETTE[i % PALETTE.length], sort: i, archived: false })));
  const today = new Date().toISOString().slice(0, 10);
  putMany('accounts', [['كاش', 'cash'], ['الحساب البنكي', 'bank']].map(([name, type], i) => ({ id: detId(`${u}:acc:${i}`), name, type, currency: baseCurrency, opening_balance: 0, opening_date: today, sort: i, archived: false })));
}

// ───── المزامنة ─────
let syncT = null, again = false, channel = null;
export function scheduleSync(ms = 300) { if (!st.cloud) return; clearTimeout(syncT); syncT = setTimeout(sync, ms); }
const wire = (table, r) => clean(table, r);
function dropOutbox(keys) {
  if (!keys.length) return; keys.forEach(k => outbox.delete(k));
  write(t => keys.forEach(k => t.objectStore('outbox').delete(k)), ['outbox']);
}
function merge(table, rows, force = false) {
  const changed = [], drop = [];
  for (const r of rows || []) {
    const local = mem[table].get(r.id), key = `${table}:${r.id}`, pend = outbox.has(key);
    if (local && !force && ts(local.updated_at) === ts(r.updated_at) && local.synced_at === r.synced_at) continue;
    if (!local || force || (pend ? ts(r.updated_at) > ts(local.updated_at) : ts(r.updated_at) >= ts(local.updated_at))) {
      mem[table].set(r.id, r); changed.push(r); if (pend) drop.push(key);
    }
  }
  if (changed.length) { write(t => changed.forEach(r => t.objectStore(table).put(r)), [table]); dropOutbox(drop); notify(); }
}
async function push() {
  for (const table of TABLE_NAMES) {
    const items = [...outbox.values()].filter(o => o.table === table);
    for (let i = 0; i < items.length; i += 200) {
      const rows = items.slice(i, i + 200).map(o => mem[table].get(o.id)).filter(Boolean).map(r => wire(table, r));
      if (!rows.length) continue;
      const { data, error } = await st.sb.from(table).upsert(rows, { onConflict: 'id' }).select('id,updated_at');
      if (error) throw error;
      const ok = new Set((data || []).map(d => d.id)), stale = rows.filter(r => !ok.has(r.id)).map(r => r.id);
      if (stale.length) { // الخادم لديه نسخة أحدث (تعديل من جهاز آخر): نأخذ نسخته
        const { data: srv, error: e2 } = await st.sb.from(table).select('*').in('id', stale);
        if (e2) throw e2; merge(table, srv, true);
      }
      dropOutbox(rows.filter(r => { const c = mem[table].get(r.id); return stale.includes(r.id) || (c && ts(c.updated_at) === ts(r.updated_at)); }).map(r => `${table}:${r.id}`));
    }
  }
}
async function pull(full = false) {
  const cursors = { ...(meta.cursors || {}) };
  for (const table of TABLE_NAMES) {
    const c = full ? null : cursors[table];
    const since = c ? new Date(ts(c) - 30000).toISOString() : '1970-01-01T00:00:00Z';
    let max = c || null;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await st.sb.from(table).select('*').gt('synced_at', since).order('synced_at').order('id').range(from, from + 999);
      if (error) throw error;
      merge(table, data);
      for (const r of data) if (!max || ts(r.synced_at) > ts(max)) max = r.synced_at;
      if (data.length < 1000) break;
    }
    if (max) cursors[table] = max;
  }
  metaSet('cursors', cursors);
  if (!st.firstPull) { st.firstPull = true; metaSet('firstPull', true); }
}
export async function sync(full = false) {
  if (!st.cloud || !st.sb) return;
  if (st.syncing) { again = true; return; }
  if (!navigator.onLine) { notify(); return; }
  st.syncing = true; notify();
  try {
    const { data: au } = await st.sb.auth.getSession();
    if (!au?.session) throw new Error('انتهت الجلسة — سجّل الدخول من جديد');
    await writeQ; await push(); await pull(full);
    st.lastSync = new Date().toISOString(); st.syncError = null; metaSet('lastSync', st.lastSync);
  } catch (e) { st.syncError = e?.message || String(e); console.warn('sync', e); }
  finally { st.syncing = false; notify(); if (again) { again = false; scheduleSync(200); } }
}
function listenRemote() {
  try {
    if (channel) st.sb.removeChannel(channel);
    channel = st.sb.channel(`mizan-${st.uid}`);
    for (const t of TABLE_NAMES) channel.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `user_id=eq.${st.uid}` }, () => scheduleSync(400));
    channel.subscribe(s => { if (s === 'SUBSCRIBED') scheduleSync(100); });
  } catch (e) { console.warn('realtime', e); }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { notify(); scheduleSync(200); });
  window.addEventListener('offline', notify);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(200); });
  setInterval(() => { if (!document.hidden) sync(); }, 60000);
}

export async function close({ wipe = false } = {}) {
  await writeQ; clearTimeout(syncT);
  try { if (channel) st.sb?.removeChannel(channel); } catch {}
  channel = null; const name = idb?.name; idb?.close(); idb = null;
  if (wipe && name) await new Promise(r => { const q = indexedDB.deleteDatabase(name); q.onsuccess = q.onerror = q.onblocked = r; });
  for (const t of TABLE_NAMES) mem[t] = new Map(); outbox = new Map(); cache = null; st.uid = null;
}

// ───── أسعار الصرف ─────
export async function fetchRates() {
  const r = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
  const j = await r.json();
  if (j.result !== 'success' || !j.rates) throw new Error('تعذر قراءة أسعار الصرف');
  const s = S(), rates = { ...s.rates };
  for (const c of Object.keys(s.currencies)) if (j.rates[c] > 0) rates[c] = j.rates[c];
  rates.USD = 1;
  updateSettings({ rates, rates_updated_at: new Date().toISOString(), rates_source: 'open.er-api.com' });
  return rates;
}

// ───── النسخ الاحتياطي ─────
export function exportBackup() {
  const tables = {}; for (const t of TABLE_NAMES) tables[t] = db()[t];
  return { app: 'mizan', version: 1, exported_at: new Date().toISOString(), uid: st.uid, tables };
}
// mode: 'merge' يضيف/يحدّث بالمعرّف ؛ 'replace' يحذف الموجود غير الوارد في النسخة ثم يستعيد
export function importBackup(b, mode = 'merge') {
  if (b?.app !== 'mizan' || !b.tables) throw new Error('ملف غير صالح: ليس نسخة احتياطية من ميزان');
  const foreign = b.uid !== st.uid, map = id => (id && foreign ? detId(`${st.uid}:${id}`) : id);
  const counts = {};
  for (const t of TABLE_NAMES) {
    let rows = (b.tables[t] || []).map(r => {
      const o = { ...r, id: map(r.id) };
      for (const [k, type] of Object.entries(TABLES[t])) if (type.includes('>')) o[k] = map(r[k]);
      return o;
    });
    if (t === 'settings') { const cur = db().settings[0]; rows = rows.slice(0, 1).map(r => ({ ...r, id: cur?.id || (st.cloud ? st.uid : detId('settings-local')) })); }
    if (mode === 'replace') { const keep = new Set(rows.map(r => r.id)); const del = db()[t].filter(r => !keep.has(r.id)).map(r => ({ id: r.id, deleted: true })); if (del.length) putMany(t, del); }
    if (rows.length) putMany(t, rows);
    counts[t] = rows.length;
  }
  return counts;
}
