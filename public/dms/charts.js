// Inline-SVG charts for the "Domo cards". One sequential hue (--c-series), target in ink,
// status steps only for ageing. Thin bars with 4px rounded data-ends, recessive grid, hover
// tooltips via [data-tip] (handled globally in dms.js), selective direct labels.
import { esc, num, kmoney } from './core.js';

const W = 560;
const niceMax = v => { if (!v || v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
// bar path with 4px rounded top only (anchored to baseline)
const vbar = (x, y, w, h, r = 4) => { r = Math.min(r, w / 2, h); if (h <= 0) return ''; return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
const hbar = (x, y, w, h, r = 4) => { r = Math.min(r, h / 2, w); if (w <= 0) return ''; return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`; };
const tip = html => `data-tip="${esc(html)}"`;

// Units delivered by month vs target (bars + target tick). data: [{label, value, target}]
export function unitsVsTarget(data, { height = 230 } = {}) {
  if (!data.length) return '';
  const pad = { l: 34, r: 8, t: 14, b: 26 }, ih = height - pad.t - pad.b, iw = W - pad.l - pad.r;
  const max = niceMax(Math.max(...data.map(d => Math.max(d.value || 0, d.target || 0))));
  const step = iw / data.length, bw = Math.max(4, Math.min(26, step * 0.56));
  const y = v => pad.t + ih - (v / max) * ih;
  const ticks = [0, .25, .5, .75, 1].map(f => f * max);
  let g = `<g class="grid">${ticks.map(t => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>`;
  g += ticks.map(t => `<text x="${pad.l - 6}" y="${y(t) + 3.5}" text-anchor="end">${num(t)}</text>`).join('');
  const every = Math.ceil(data.length / 12);
  data.forEach((d, i) => {
    const cx = pad.l + step * i + step / 2, x = cx - bw / 2;
    const met = d.target ? d.value >= d.target : null;
    const t = `<b>${esc(d.label)}</b><br>${num(d.value)} delivered${d.target ? `<br><span class="k">target</span> ${num(d.target)} · ${Math.round((d.value / d.target) * 100)}%` : ''}`;
    g += `<g class="m" ${tip(t)}><rect class="hit" x="${cx - step / 2}" y="${pad.t}" width="${step}" height="${ih}"/>`;
    g += `<path class="mk" d="${vbar(x, y(d.value || 0), bw, ih + pad.t - y(d.value || 0))}" fill="var(--c-series)" opacity="${met === false ? .55 : 1}"/>`;
    if (d.target) g += `<line x1="${x - 3}" x2="${x + bw + 3}" y1="${y(d.target)}" y2="${y(d.target)}" stroke="var(--c-target)" stroke-width="2" stroke-linecap="round"/>`;
    g += `</g>`;
    if (i % every === 0 || i === data.length - 1) g += `<text x="${cx}" y="${height - 8}" text-anchor="middle">${esc(d.short || d.label)}</text>`;
  });
  const last = data[data.length - 1];
  if (last) { const cx = pad.l + step * (data.length - 1) + step / 2; g += `<text class="val" x="${cx}" y="${y(Math.max(last.value, last.target || 0)) - 6}" text-anchor="middle">${num(last.value)}</text>`; }
  return `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="Units delivered by month against target">${g}<line class="axis" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/></svg>`;
}

// Horizontal bars. data: [{label, value, sub?, target?}] ; fmt(value)
export function hbars(data, { fmt = num, rowH = 30, labelW = 120, ref = null, refLabel = '', color = () => 'var(--c-series)', tipFn } = {}) {
  if (!data.length) return '';
  const pad = { t: ref != null ? 16 : 4, b: 4, r: 64 }, height = pad.t + data.length * rowH + pad.b;
  const iw = W - labelW - pad.r;
  const max = niceMax(Math.max(...data.map(d => Math.max(d.value || 0, d.target || 0)), ref || 0));
  const x = v => labelW + (v / max) * iw;
  let g = '';
  data.forEach((d, i) => {
    const y0 = pad.t + i * rowH, bh = Math.min(14, rowH - 12), by = y0 + (rowH - bh) / 2;
    const t = tipFn ? tipFn(d) : `<b>${esc(d.label)}</b><br>${fmt(d.value)}${d.sub ? `<br><span class="k">${esc(d.sub)}</span>` : ''}`;
    g += `<g class="m" ${tip(t)}><rect class="hit" x="0" y="${y0}" width="${W}" height="${rowH}"/>`;
    g += `<text x="${labelW - 10}" y="${by + bh / 2 + 3.5}" text-anchor="end" style="fill:var(--text);font-weight:500">${esc(d.label)}</text>`;
    g += `<rect x="${labelW}" y="${by}" width="${iw}" height="${bh}" rx="4" fill="var(--hairline)"/>`;
    g += `<path class="mk" d="${hbar(labelW, by, Math.max(0, x(d.value || 0) - labelW), bh)}" fill="${color(d)}"/>`;
    if (d.target) g += `<line x1="${x(d.target)}" x2="${x(d.target)}" y1="${by - 3}" y2="${by + bh + 3}" stroke="var(--c-target)" stroke-width="2" stroke-linecap="round"/>`;
    g += `<text class="val" x="${x(d.value || 0) + 6}" y="${by + bh / 2 + 3.5}">${fmt(d.value)}</text></g>`;
  });
  if (ref != null) g += `<line x1="${x(ref)}" x2="${x(ref)}" y1="${pad.t - 4}" y2="${height - pad.b}" stroke="var(--c-target)" stroke-width="1.5" stroke-dasharray="3 3"/><text x="${x(ref)}" y="${pad.t - 6}" text-anchor="middle">${esc(refLabel)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img">${g}</svg>`;
}

// Funnel: stages [{label, value}] -> centred bars with step conversion
export function funnel(stages) {
  if (!stages.length) return '';
  const rowH = 40, height = stages.length * rowH + 4, max = Math.max(...stages.map(s => s.value || 0)) || 1, iw = 300, cx = 150 + 120;
  let g = '';
  stages.forEach((s, i) => {
    const w = Math.max(6, (s.value / max) * iw), y = i * rowH + 6, h = rowH - 12;
    const prev = i ? stages[i - 1].value : null, conv = prev ? Math.round((s.value / prev) * 100) : null;
    const t = `<b>${esc(s.label)}</b><br>${num(s.value)}${conv != null ? `<br><span class="k">from previous step</span> ${conv}%` : ''}<br><span class="k">of top</span> ${Math.round((s.value / max) * 100)}%`;
    const shade = 1 - i * (0.5 / Math.max(1, stages.length - 1));
    g += `<g class="m" ${tip(t)}><rect class="hit" x="0" y="${i * rowH}" width="${W}" height="${rowH}"/>`;
    g += `<text x="10" y="${y + h / 2 + 4}" style="fill:var(--text);font-weight:500">${esc(s.label)}</text>`;
    g += `<rect class="mk" x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="4" fill="var(--c-series)" opacity="${shade.toFixed(2)}"/>`;
    g += `<text class="val" x="${cx}" y="${y + h / 2 + 4}" text-anchor="middle" style="fill:${shade > .62 ? '#fff' : 'var(--text)'}">${num(s.value)}</text>`;
    if (conv != null) g += `<text x="${W - 8}" y="${y + h / 2 + 4}" text-anchor="end">${conv}%</text>`;
    g += `</g>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="Sales funnel">${g}<text x="${W - 8}" y="0" text-anchor="end" dy="-2" style="font-size:9px">step conv.</text></svg>`;
}

// Histogram with ordinal status colours. buckets [{label, value, color}]
export function histogram(buckets, { height = 200 } = {}) {
  if (!buckets.length) return '';
  const pad = { l: 30, r: 8, t: 16, b: 26 }, ih = height - pad.t - pad.b, iw = W - pad.l - pad.r;
  const max = niceMax(Math.max(...buckets.map(b => b.value || 0)));
  const step = iw / buckets.length, bw = step - 2; // 2px surface gap
  const y = v => pad.t + ih - (v / max) * ih;
  let g = `<g class="grid">${[0, .5, 1].map(f => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(f * max)}" y2="${y(f * max)}"/>`).join('')}</g>`;
  g += [0, .5, 1].map(f => `<text x="${pad.l - 6}" y="${y(f * max) + 3.5}" text-anchor="end">${num(f * max)}</text>`).join('');
  buckets.forEach((b, i) => {
    const x = pad.l + step * i + 1;
    g += `<g class="m" ${tip(`<b>${esc(b.label)} days</b><br>${num(b.value)} units`)}><rect class="hit" x="${x}" y="${pad.t}" width="${bw}" height="${ih}"/>`;
    g += `<path class="mk" d="${vbar(x, y(b.value || 0), bw, pad.t + ih - y(b.value || 0))}" fill="${b.color}"/>`;
    if (b.value) g += `<text class="val" x="${x + bw / 2}" y="${y(b.value) - 5}" text-anchor="middle">${num(b.value)}</text>`;
    g += `<text x="${x + bw / 2}" y="${height - 8}" text-anchor="middle">${esc(b.label)}</text></g>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="Stock ageing histogram">${g}<line class="axis" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/></svg>`;
}

export const AGE_BUCKETS = [
  { label: '0–30', max: 30, color: 'var(--c-age-0)', name: 'Fresh' },
  { label: '31–59', max: 59, color: 'var(--c-age-2)', name: 'Watch' },
  { label: '60–89', max: 89, color: 'var(--c-age-3)', name: 'Aged' },
  { label: '90+', max: Infinity, color: 'var(--c-age-4)', name: 'Move priority' },
];
export const ageColor = d => (AGE_BUCKETS.find(b => d <= b.max) || AGE_BUCKETS[3]).color;
export const legend = items => `<div class="legend">${items.map(([c, l, line]) => `<span><i class="${line ? 'line' : ''}" style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>`;
export { kmoney };
