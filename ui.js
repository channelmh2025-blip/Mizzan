// أدوات الواجهة: تنسيق، نوافذ سفلية، نماذج، تنبيهات، رسوم SVG تفاعلية (بدون مكتبات خارجية)
import { S } from './store.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const loc = () => (S().prefs.digits === 'ar' ? 'ar-EG' : 'en-US');
export function nfmt(n, dec = 2) { return new Intl.NumberFormat(loc(), { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Math.abs(n) < 0.0005 ? 0 : n); }
export const curInfo = c => S().currencies[c] || { name: c, symbol: c, decimals: 2 };
export function money(n, cur = S().display_currency, { sign = false } = {}) {
  const i = curInfo(cur), v = Number(n) || 0;
  return `<span class="money"><b>${sign && v > 0 ? '+' : ''}${nfmt(v, i.decimals)}</b> <i>${esc(i.symbol)}</i></span>`;
}
export const moneyT = (n, cur = S().display_currency) => `${nfmt(Number(n) || 0, curInfo(cur).decimals)} ${curInfo(cur).symbol}`;
export const compact = n => new Intl.NumberFormat(loc(), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const pct = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : `${nfmt(v * 100, d)}%`);
export function fmtDate(s) {
  if (!s) return '—'; const [y, m, d] = s.slice(0, 10).split('-').map(Number), f = S().prefs.dateFmt || 'long';
  if (f === 'iso') return s.slice(0, 10);
  if (f === 'dmy') return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
export const fmtMonth = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
export const dayName = s => { const [y, m, d] = s.split('-').map(Number); return DAYS[new Date(y, m - 1, d).getDay()]; };
export function parseNum(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫]/g, '.').replace(/[,٬\s]/g, '');
  return s === '' ? NaN : Number(s);
}

// ───── الأحداث: data-a="action" ─────
const actions = {};
export const on = (name, fn) => { actions[name] = fn; };
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const fn = actions[el.dataset.a]; if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
});

// ───── تنبيه عابر ─────
export function toast(msg, type = 'ok') {
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3000);
}

// ───── نافذة سفلية ─────
let sheetClose = null;
export function openSheet(title, html, { onClose = null, wide = false } = {}) {
  const s = $('#sheet');
  s.innerHTML = `<div class="sheet-bg" data-a="sheet-close"></div><div class="sheet-box ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><button class="icon-btn" data-a="sheet-close" aria-label="إغلاق">✕</button></header><div class="sheet-body">${html}</div></div>`;
  s.hidden = false; document.body.classList.add('no-scroll'); sheetClose = onClose;
  return $('.sheet-body', s);
}
export function closeSheet(silent = false) {
  const s = $('#sheet'); if (s.hidden) return; s.hidden = true; s.innerHTML = ''; document.body.classList.remove('no-scroll');
  const f = sheetClose; sheetClose = null; if (f && !silent) f();
}
on('sheet-close', () => closeSheet());
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#dialog').hidden) return; closeSheet(); } });

export function confirmBox(msg, { ok = 'تأكيد', danger = false, cancel = 'إلغاء' } = {}) {
  return new Promise(res => {
    const d = $('#dialog');
    d.innerHTML = `<div class="sheet-bg"></div><div class="dialog-box" role="alertdialog"><p>${esc(msg)}</p><div class="row-btns">
      <button class="btn ghost" data-r="0">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : ''}" data-r="1">${esc(ok)}</button></div></div>`;
    d.hidden = false;
    d.onclick = e => { const b = e.target.closest('[data-r]'); if (!b && !e.target.classList.contains('sheet-bg')) return; d.hidden = true; d.innerHTML = ''; res(b?.dataset.r === '1'); };
  });
}

// ───── النماذج ─────
// field: { name, label, type, options:[[value,label]], required, hint, show(vals), allowZero, placeholder }
function fieldHtml(f, v) {
  const id = `f_${f.name}`, req = f.required ? ' required' : '', val = v ?? '';
  let inner;
  switch (f.type) {
    case 'select': inner = `<select id="${id}" name="${f.name}"${req}>${f.required ? '' : '<option value="">—</option>'}${f.options.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`; break;
    case 'textarea': inner = `<textarea id="${id}" name="${f.name}" rows="2" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`; break;
    case 'toggle': inner = `<label class="toggle"><input type="checkbox" id="${id}" name="${f.name}"${val ? ' checked' : ''}><span></span><em>${esc(f.text || '')}</em></label>`; break;
    case 'seg': case 'chips': inner = `<div class="${f.type}">${f.options.map(([k, l, ic]) => `<label><input type="radio" name="${f.name}" value="${esc(k)}"${String(k) === String(val) ? ' checked' : ''}><span>${ic ? `<u>${esc(ic)}</u>` : ''}${esc(l)}</span></label>`).join('')}</div>`; break;
    case 'number': inner = `<input id="${id}" name="${f.name}" type="text" inputmode="decimal" autocomplete="off" dir="ltr" class="${f.big ? 'big' : ''}" placeholder="${esc(f.placeholder || '0')}" value="${esc(val)}"${req}>`; break;
    case 'int': inner = `<input id="${id}" name="${f.name}" type="text" inputmode="numeric" autocomplete="off" dir="ltr" value="${esc(val)}"${req}>`; break;
    default: inner = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}"${req}${f.type === 'email' || f.type === 'password' ? ' dir="ltr"' : ''}${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''}>`;
  }
  return `<div class="f ${f.half ? 'half' : ''}" data-f="${f.name}"><label ${f.type === 'seg' || f.type === 'chips' || f.type === 'toggle' ? '' : `for="${id}"`} class="lbl">${esc(f.label)}${f.required ? '' : ' <small>اختياري</small>'}</label>${inner}${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}<p class="err" hidden></p></div>`;
}
export function readForm(form, fields) {
  const vals = {};
  for (const f of fields) {
    if (f.type === 'toggle') vals[f.name] = !!form.elements[f.name]?.checked;
    else if (f.type === 'seg' || f.type === 'chips') vals[f.name] = form.querySelector(`input[name="${f.name}"]:checked`)?.value ?? '';
    else { const el = form.elements[f.name]; let v = el ? el.value.trim() : ''; if (f.type === 'number' || f.type === 'int') v = v === '' ? '' : parseNum(v); vals[f.name] = v; }
  }
  return vals;
}
export function openForm({ title, fields, values = {}, submit = 'حفظ', onSubmit, onDelete, deleteLabel = 'حذف', intro = '', onChange, onClose }) {
  const body = openSheet(title, `${intro}<form class="form" novalidate>${fields.map(f => fieldHtml(f, values[f.name] ?? f.value)).join('')}
    <div class="form-actions">${onDelete ? `<button type="button" class="btn ghost danger-t" data-del>${esc(deleteLabel)}</button>` : ''}<button class="btn primary grow" type="submit">${esc(submit)}</button></div></form>`, { onClose });
  const form = $('form', body);
  const refresh = () => { const v = readForm(form, fields); for (const f of fields) if (f.show) $(`[data-f="${f.name}"]`, form).hidden = !f.show(v); return v; };
  refresh();
  form.addEventListener('input', e => { const v = refresh(); onChange?.(v, form, e.target.name); });
  form.addEventListener('submit', async e => {
    e.preventDefault(); const v = refresh(); let bad = null;
    for (const f of fields) {
      const box = $(`[data-f="${f.name}"]`, form), err = $('.err', box); let msg = '';
      if (!box.hidden) {
        if (f.required && (v[f.name] === '' || v[f.name] == null)) msg = 'هذا الحقل مطلوب';
        else if ((f.type === 'number' || f.type === 'int') && v[f.name] !== '') {
          if (!Number.isFinite(v[f.name])) msg = 'أدخل رقماً صحيحاً';
          else if (v[f.name] < 0 && !f.allowNegative) msg = 'لا يمكن أن يكون سالباً';
          else if (v[f.name] === 0 && f.required && !f.allowZero) msg = 'أدخل مبلغاً أكبر من صفر';
        }
        if (!msg && f.validate) msg = f.validate(v[f.name], v) || '';
      }
      err.textContent = msg; err.hidden = !msg; if (msg && !bad) bad = box;
    }
    if (bad) { bad.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try { const r = await onSubmit(v, form); if (r !== false) closeSheet(); } catch (er) { console.error(er); toast(er.message || 'حدث خطأ', 'bad'); } finally { btn.disabled = false; }
  });
  $('[data-del]', form)?.addEventListener('click', async () => { if (await onDelete() !== false) closeSheet(); });
  const first = fields.find(f => f.focus); if (first) setTimeout(() => form.elements[first.name]?.focus(), 60);
  return form;
}

// ───── الرسوم البيانية (SVG، من اليمين إلى اليسار) ─────
const W = 340, H = 190, PR = 38, PL = 8, PT = 12, PB = 26;
function scale(max) { if (!(max > 0)) return 1; const p = 10 ** Math.floor(Math.log10(max)), n = max / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
function frame(labels, max, min = 0) {
  const top = scale(Math.max(max, -min, 1)), lo = min < 0 ? -top : 0, ph = H - PT - PB, pw = W - PR - PL;
  const y = v => PT + ph * (1 - (v - lo) / (top - lo)), step = pw / Math.max(1, labels.length);
  const x = i => W - PR - step * (i + 0.5); // الشهر الأول على اليمين
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = lo + ((top - lo) * k) / 4; g += `<line x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}" class="grid${v === 0 ? ' zero' : ''}"/><text x="${W - PR + 4}" y="${y(v) + 3}" class="ax">${compact(v)}</text>`; }
  const every = Math.ceil(labels.length / 7);
  labels.forEach((l, i) => { if (i % every === 0) g += `<text x="${x(i)}" y="${H - 8}" class="ax mid">${esc(l)}</text>`; });
  return { g, x, y, step, y0: y(0) };
}
const svg = (inner, label) => `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">${inner}</svg>`;
const legend = series => `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
export function barChart({ labels, series, label = '', fmt = moneyT }) {
  const all = series.flatMap(s => s.values.filter(v => v != null));
  if (!all.some(v => v)) return empty('لا توجد بيانات كافية بعد');
  const fr = frame(labels, Math.max(...all, 0), Math.min(...all, 0)), bw = Math.min(16, (fr.step * 0.72) / series.length);
  let b = '';
  series.forEach((s, si) => s.values.forEach((v, i) => {
    if (v == null) return; const x = fr.x(i) + (series.length / 2 - si - 1) * bw + 1, h = Math.abs(fr.y(v) - fr.y0);
    b += `<rect x="${x}" y="${Math.min(fr.y(v), fr.y0)}" width="${bw - 2}" height="${Math.max(h, v ? 1.5 : 0)}" rx="2.5" fill="${s.color}" data-tip="${esc(`${labels[i]} · ${s.name}: ${fmt(v)}`)}"/>`;
  }));
  return svg(fr.g + b, label) + legend(series);
}
export function lineChart({ labels, series, label = '', fmt = moneyT, area = true }) {
  const all = series.flatMap(s => s.values.filter(v => v != null));
  if (all.length < 1 || !all.some(v => v)) return empty('لا توجد بيانات كافية بعد');
  const fr = frame(labels, Math.max(...all, 0), Math.min(...all, 0)); let b = '';
  for (const s of series) {
    const pts = s.values.map((v, i) => (v == null ? null : [fr.x(i), fr.y(v), v, i])).filter(Boolean);
    if (!pts.length) continue;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    if (area && series.length === 1) b += `<path d="${d}L${pts[pts.length - 1][0]},${fr.y0}L${pts[0][0]},${fr.y0}Z" fill="${s.color}" opacity=".12"/>`;
    b += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    b += pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#fff" stroke="${s.color}" stroke-width="2"/><circle cx="${p[0]}" cy="${p[1]}" r="11" fill="transparent" data-tip="${esc(`${labels[p[3]]} · ${s.name}: ${fmt(p[2])}`)}"/>`).join('');
  }
  return svg(fr.g + b, label) + (series.length > 1 ? legend(series) : '');
}
export function donut({ items, label = '', fmt = moneyT, center = '' }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!(total > 0)) return empty('لا توجد مصروفات في هذه الفترة');
  const R = 62, r = 40, cx = 80, cy = 80; let a = -Math.PI / 2, p = '';
  for (const it of items) {
    const f = it.value / total, b = a + f * Math.PI * 2 - (items.length > 1 ? 0.02 : 0.0001), large = f > 0.5 ? 1 : 0;
    const pt = (rad, ang) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
    p += `<path d="M${pt(R, a)}A${R},${R} 0 ${large} 1 ${pt(R, b)}L${pt(r, b)}A${r},${r} 0 ${large} 0 ${pt(r, a)}Z" fill="${it.color}" data-tip="${esc(`${it.label}: ${fmt(it.value)} (${pct(f)})`)}"/>`;
    a += f * Math.PI * 2;
  }
  return `<div class="donut"><svg viewBox="0 0 160 160" role="img" aria-label="${esc(label)}">${p}<text x="80" y="76" class="dc1">${esc(center)}</text><text x="80" y="94" class="dc2">${esc(compact(total))}</text></svg>
    <ul>${items.map(it => `<li><i style="background:${it.color}"></i><span>${esc(it.label)}</span><b>${pct(it.value / total)}</b></li>`).join('')}</ul></div>`;
}
export function gauge(v, text) {
  const f = Math.max(0, Math.min(1, v || 0)), col = f > 0.5 ? 'var(--red)' : f > 0.35 ? 'var(--orange)' : 'var(--green)';
  return `<div class="gauge"><div class="gauge-bar"><i style="width:${f * 100}%;background:${col}"></i><u style="inset-inline-start:35%"></u><u style="inset-inline-start:50%"></u></div><div class="gauge-l"><b style="color:${col}">${pct(v, 1)}</b><span>${esc(text)}</span></div></div>`;
}
export const empty = (msg, cta = '') => `<div class="empty"><p>${esc(msg)}</p>${cta}</div>`;
export const bar = (f, level = 'green') => `<div class="pbar ${level}"><i style="width:${Math.max(0, Math.min(1, f || 0)) * 100}%"></i></div>`;

// تلميح الرسوم
const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true;
document.addEventListener('DOMContentLoaded', () => document.body.append(tip));
function showTip(e) {
  const el = e.target.closest?.('[data-tip]'); if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip; tip.hidden = false;
  const r = el.getBoundingClientRect(), tw = tip.offsetWidth;
  tip.style.left = `${Math.max(6, Math.min(innerWidth - tw - 6, r.left + r.width / 2 - tw / 2))}px`;
  tip.style.top = `${Math.max(6, r.top - tip.offsetHeight - 8)}px`;
}
document.addEventListener('pointerover', showTip); document.addEventListener('click', showTip);
window.addEventListener('scroll', () => { tip.hidden = true; }, true);

export function download(name, content, type = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const csv = rows => '﻿' + rows.map(r => r.map(c => { const s = String(c ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
