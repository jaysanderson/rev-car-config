// Harbourline DMS · the user manual, rendered from the same markdown that is in the knowledge box.
// GET /manual/chapters → {items:[{slug, title, topic, summary}]}; GET /manual/chapters/:slug → {slug, title, markdown}.
import { api, state, esc, icon, pagehead, loading, failState, empty, tagArag, ann, prose, citations } from '../core.js';

const FALLBACK = ['getting-started', 'dashboard', 'leads', 'test-drives', 'deals-pipeline', 'customers', 'stock', 'promotions-campaigns', 'digital-experience', 'documents', 'assistant', 'insights-domo', 'settings-api-mcp', 'service-job-cards', 'suppliers', 'help-and-onboarding', 'infomedia'];
const titleOf = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace('Api Mcp', 'API & MCP').replace('Domo', 'Domo').replace('Dxm', 'DXM');

export default async function manual(root, ctx) {
  const slug = ctx.params[0] || '';
  root.innerHTML = pagehead({ title: 'User manual', tags: tagArag(), sub: `The same chapters the Help bubble and the assistant answer from. ${ann('GET /dms/api/manual/chapters', 'kb')}`, actions: `<form id="mnSearch" class="row"><input class="input" id="mnQ" placeholder="Search the manual…" style="width:260px"><button class="btn secondary sm">Search</button></form>` }) +
    `<div class="mn-layout"><aside class="card mn-toc"><div class="chead"><h3>Chapters</h3></div><div class="cbody" id="mnToc">${loading(8)}</div></aside><section class="card mn-body"><div class="cbody" id="mnBody">${slug ? loading(10) : ''}</div></section></div>`;
  const toc = root.querySelector('#mnToc'); const body = root.querySelector('#mnBody');
  const r = await api('/manual/chapters', { timeout: 20000 });
  let chapters = r.ok ? (r.data.items || r.data.chapters || r.data) : null;
  if (!Array.isArray(chapters) || !chapters.length) chapters = FALLBACK.map((s) => ({ slug: s, title: titleOf(s) }));
  toc.innerHTML = `<nav class="mn-nav">${chapters.map((c) => `<a href="#/manual/${esc(c.slug)}" class="${c.slug === slug ? 'on' : ''}"><b>${esc(c.title)}</b>${c.summary ? `<span>${esc(c.summary)}</span>` : ''}</a>`).join('')}</nav>${!r.ok ? `<p class="subtle" style="font-size:.72rem;margin-top:10px">${r.status === 404 ? 'Chapter list from the built-in index (the manual API is not in this build yet).' : esc(r.friendly?.message || r.error)}</p>` : ''}`;
  root.querySelector('#mnSearch').onsubmit = async (e) => {
    e.preventDefault(); const q = root.querySelector('#mnQ').value.trim(); if (!q) return;
    body.innerHTML = `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Searching the manual…</div>`;
    const s = await api('/search', { query: { q }, timeout: 20000 });
    if (!s.ok) { body.innerHTML = failState(s, { what: 'search results', endpoint: 'GET /search', inline: true }); return; }
    const hits = (s.data.knowledge || (s.data.items || []).filter((x) => x.source === 'kb')).filter((x) => /manual/i.test(`${x.label || ''} ${x.title || ''} ${x.slug || ''}`) || (x.topic || '') === 'manual');
    body.innerHTML = `<h2>Results for “${esc(q)}”</h2>${hits.length ? `<div class="stack" style="gap:10px;margin-top:12px">${hits.slice(0, 12).map((h) => { const m = `${h.slug || ''} ${h.title || ''}`.toLowerCase().match(/manual[-\s]+([a-z0-9-]+)/); return `<div class="card flat" style="padding:12px"><b>${m ? `<a href="#/manual/${m[1]}">${esc(h.title)}</a>` : esc(h.title)}</b><p class="muted" style="font-size:.84rem;margin-top:4px">${esc(h.snippet || '')}</p></div>`; }).join('')}</div>` : `<p class="muted" style="margin-top:12px">No manual passages matched. <a href="#" id="mnAsk">Ask the assistant instead</a>.</p>`}`;
    const a = body.querySelector('#mnAsk'); if (a) a.onclick = (ev) => { ev.preventDefault(); window.hlHelp?.open({ question: q }); };
  };
  if (!slug) { body.innerHTML = `<div class="mn-intro"><h2>Harbourline DMS manual</h2><p class="muted">Pick a chapter on the left, search above, or ask the Help bubble bottom-right: it answers from these chapters and cites them.</p><div class="mn-cards">${chapters.map((c) => `<a class="mn-card" href="#/manual/${esc(c.slug)}">${icon('documents')}<b>${esc(c.title)}</b>${c.summary ? `<span>${esc(c.summary)}</span>` : ''}</a>`).join('')}</div></div>`; return; }
  const c = await api(`/manual/chapters/${encodeURIComponent(slug)}`, { timeout: 20000 });
  if (!c.ok) {
    body.innerHTML = c.status === 404 ? empty({ inline: true, ic: 'documents', title: titleOf(slug), body: 'This chapter is in the knowledge box but the page cannot read its markdown until <code>GET /dms/api/manual/chapters/:slug</code> is in the build. Ask the Help bubble about it instead.', actions: `<button class="btn sm" id="mnAskCh">Ask about “${esc(titleOf(slug))}”</button>` }) : failState(c, { what: 'this chapter', endpoint: `GET /manual/chapters/${slug}`, inline: true });
    const b = body.querySelector('#mnAskCh'); if (b) b.onclick = () => window.hlHelp?.open({ question: `Explain the ${titleOf(slug)} chapter of the manual` });
    return;
  }
  const d = c.data || {};
  body.innerHTML = `<article class="mn-article">${markdown(d.markdown || d.body || d.content || '')}</article><footer class="mn-foot"><span class="subtle">Chapter <span class="mono">${esc(d.slug || slug)}</span>${d.topic ? ` · topic/${esc(d.topic)}` : ''} · also indexed in the knowledge box</span><button class="btn ghost sm" id="mnAskThis">Ask about this chapter</button></footer>`;
  body.querySelector('#mnAskThis').onclick = () => window.hlHelp?.open({ question: `I am reading the ${d.title || titleOf(slug)} chapter. What are the three things I should do first?` });
  if (ctx.query.h) { const h = body.querySelector(`#${CSS.escape(ctx.query.h)}`); h && h.scrollIntoView(); }
}

// Tiny markdown renderer: headings, paragraphs, lists, tables, code, bold/italic/code/links, frontmatter stripped.
export function markdown(src) {
  src = String(src || '').replace(/^---[\s\S]*?---\s*/, '');
  const lines = src.replace(/\r/g, '').split('\n');
  const out = []; let i = 0;
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>').replace(/\[([^\]]+)\]\((#[^)]+|https?:[^)]+|\/[^)]+)\)/g, (m, t, u) => `<a href="${u}"${/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`);
  const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    if (/^```/.test(ln)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre class="code">${esc(buf.join('\n'))}</pre>`); continue; }
    const h = ln.match(/^(#{1,4})\s+(.*)/); if (h) { const lvl = h[1].length; out.push(`<h${lvl} id="${slugify(h[2])}">${inline(h[2])}</h${lvl}>`); i++; continue; }
    if (/^\|/.test(ln)) { const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]); const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()); const head = cells(rows[0]); const bodyRows = rows.slice(1).filter((r) => !/^\|\s*-/.test(r)); out.push(`<div class="datatable compact"><div class="scroll"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${bodyRows.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`); continue; }
    if (/^\s*(?:[-*]|\d+[.)])\s+/.test(ln)) { const ordered = /^\s*\d/.test(ln); const its = []; while (i < lines.length && /^\s*(?:[-*]|\d+[.)])\s+/.test(lines[i])) its.push(lines[i++].replace(/^\s*(?:[-*]|\d+[.)])\s+/, '')); out.push(`<${ordered ? 'ol' : 'ul'}>${its.map((t) => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`); continue; }
    if (/^>\s?/.test(ln)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote class="notice info">${inline(buf.join(' '))}</blockquote>`); continue; }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\||\s*(?:[-*]|\d+[.)])\s|>)/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}
