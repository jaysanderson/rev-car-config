import { api, state, esc, items, num, dateTime, pagehead, loading, failState, empty, tagArag, ann, copy, toast, ROLE_LABEL, cap, API } from '../core.js';

const ROLES = [
  ['gm', 'Everything, all four sites. Recomputes Domo signals, sets targets, approves any discount.'],
  ['sales_manager', 'Own site: all leads, deals and test drives, approvals within the matrix, publishes promotions.'],
  ['salesperson', 'Own leads, test drives and deals; stock and promotions read-only.'],
  ['dxm', 'Configurator report, bookings, handovers, promotions (with publish), campaigns, documents, leads read-only.'],
  ['finance', 'Deals in finance, finance applications, trade-ins, documents.'],
];
export default async function settings(root, ctx) {
  const abs = p => new URL(p, location.origin).href;
  root.innerHTML = pagehead({ title: 'Settings & API', sub: 'Every screen in the DMS is built on the public API at <span class="mono">/dms/api</span>. Anything you can do here, another system can do through the API with the right role.' }) +
  `<div class="grid g2" style="align-items:start">
    <section class="card"><div class="chead"><h3>API</h3><div class="r">${ann('GET /dms/api/openapi.json')}</div></div><div class="cbody stack" style="gap:12px">
      <div class="row"><a class="btn" href="/dms/api/docs" target="_blank" rel="noopener">Open API docs</a><button class="btn secondary" id="dlo">Download OpenAPI</button><button class="btn ghost" id="tok">Copy token</button></div>
      <dl class="kv"><dt>Base URL</dt><dd class="mono">${esc(abs('/dms/api'))}</dd><dt>Auth</dt><dd><span class="mono">POST /auth/login</span> → <span class="mono">Authorization: Bearer &lt;token&gt;</span></dd><dt>Lists</dt><dd><span class="mono">q, siteId, status, from, to, sort, page, pageSize</span> → <span class="mono">{items, total, page, pageSize}</span></dd><dt>Health</dt><dd id="hl">…</dd><dt>Routes</dt><dd id="rc">…</dd></dl>
      <div class="code">curl -H "Authorization: Bearer &lt;token&gt;" \\
  "${esc(abs('/dms/api/deals?stage=finance&siteId=pen'))}"</div>
    </div></section>
    <section class="card aipanel"><div class="chead"><h3>Progress Agentic RAG</h3>${tagArag()}<div class="r">${ann('GET /dms/api/arag/status', 'kb')}</div></div><div class="cbody" id="arag">${loading(6)}</div></section>
    <section class="card" style="grid-column:1/-1" id="mcpcard"><div class="chead"><h3>MCP · DMS tools for AI clients</h3><div class="r">${ann('GET /dms/api/mcp/info')}</div></div><div class="cbody" id="mcp">${loading(6)}</div></section>
    <section class="card"><div class="chead"><h3>Personal access tokens</h3><div class="r">${ann('GET/POST/DELETE /dms/api/access-tokens')}</div></div><div class="cbody stack" style="gap:12px" id="pat">${loading(4)}</div></section>
    <section class="card"><div class="chead"><h3>Architecture</h3></div><div class="cbody"><ol class="steps-ol">
      <li><span><b>API-first.</b> Every screen in this web front-end calls <span class="mono">/dms/api</span> only; nothing reads the database directly.</span></li>
      <li><span><b>OpenAPI.</b> <a href="/dms/api/openapi.json" target="_blank" rel="noopener" class="mono">/dms/api/openapi.json</a> is generated from the route table; <a href="/dms/api/docs" target="_blank" rel="noopener" class="mono">/dms/api/docs</a> renders it.</span></li>
      <li><span><b>MCP.</b> The same routes are exposed as MCP tools at <span class="mono">${esc(abs('/dms/mcp'))}</span> (Streamable HTTP) for Claude, Cursor and other agents, under the caller’s role.</span></li>
      <li><span><b>Web front-end.</b> A static, build-free SPA at <span class="mono">/dms</span> (HTML, CSS and ES modules), hash-routed, with the Progress kit tokens.</span></li>
      <li><span><b>AI and data.</b> Progress Agentic RAG answers, drafts and extracts server-side; Domo pulls CSV exports and returns dealer signals.</span></li>
    </ol></div></section>
    <section class="card"><div class="chead"><h3>Roles</h3></div><div class="cbody"><dl class="kv">${ROLES.map(([r, d]) => `<dt>${esc(ROLE_LABEL[r])}</dt><dd style="font-size:.84rem">${esc(d)}${state.user?.role === r ? ' <span class="chip good">You</span>' : ''}</dd>`).join('')}</dl></div></section>
    <section class="card"><div class="chead"><h3>Demo logins</h3><span class="sub">prototype only · password demo1234</span><div class="r">${ann('GET /dms/api/auth/users')}</div></div><div class="cbody" id="demo">${loading(4)}</div></section>
  </div>`;
  root.querySelector('#tok').onclick = () => state.token ? copy(state.token) : toast('No token in this session');
  root.querySelector('#dlo').onclick = async () => {
    const r = await api('/openapi.json'); if (!r.ok) return toast(`OpenAPI unavailable (${r.status})`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'harbourline-dms-openapi.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  const [h, o, s, u, mi] = await Promise.all([api('/health'), api('/openapi.json'), api('/arag/status'), api('/auth/users'), api('/mcp/info')]);
  renderMcp(root.querySelector('#mcp'), mi, abs);
  renderPats(root.querySelector('#pat'));
  root.querySelector('#hl').innerHTML = h.ok ? `<span class="chip good">ok</span> <span class="subtle" style="font-size:.78rem">${h.data?.version ? 'v' + esc(h.data.version) + ' · ' : ''}${h.data?.loadedAt ? 'data loaded ' + dateTime(h.data.loadedAt) : ''}</span>` : `<span class="chip bad">${h.status || 'down'}</span>`;
  root.querySelector('#rc').textContent = o.ok ? `${Object.values(o.data.paths || {}).reduce((n, p) => n + Object.keys(p).length, 0)} operations · OpenAPI ${o.data.openapi || ''}` : '—';
  const ab = root.querySelector('#arag');
  if (!s.ok) ab.innerHTML = failState(s, { what: 'the knowledge-box status', inline: true });
  else {
    const d = s.data; const mcp = d.mcp?.url || '';
    const snippet = mcp ? `claude mcp add harbourline-kb --transport http ${mcp} --header "Authorization: Bearer <KB reader key>"` : '';
    ab.innerHTML = `<dl class="kv"><dt>Status</dt><dd>${d.configured ? '<span class="chip good">Configured</span>' : '<span class="chip warn">Not configured</span>'}${d.error ? ` <span class="chip bad">${esc(d.error)}</span>` : ''}</dd><dt>Knowledge box</dt><dd class="mono">${esc(d.kbId || '—')}</dd><dt>Zone</dt><dd>${esc(d.zone || '—')}</dd><dt>Resources</dt><dd>${num(d.resources)}${d.paragraphs ? ` · ${num(d.paragraphs)} paragraphs` : ''}</dd><dt>By topic</dt><dd>${Object.entries(d.byTopic || {}).map(([k, v]) => `<span class="chip neutral">${esc(k)} ${num(v)}</span>`).join(' ') || '—'}</dd><dt>ERP agent</dt><dd style="font-size:.82rem">${esc(d.agents?.erpAgent?.kind || '—')}<br><span class="mono subtle">${esc((d.agents?.erpAgent?.tools || []).join(' · '))}</span></dd></dl>
      <div class="label" style="margin:14px 0 6px">Knowledge box MCP endpoint</div>
      ${mcp ? `<div class="copyrow"><code title="${esc(mcp)}">${esc(mcp)}</code><button class="btn secondary sm" id="cmcp">Copy</button></div>
      <div class="label" style="margin:14px 0 6px">Copy for Claude Code</div><div class="code" style="white-space:pre-wrap">${esc(snippet)}</div><div class="row" style="margin-top:8px"><button class="btn ghost sm" id="ccc">Copy command</button><span class="subtle" style="font-size:.74rem">Use a knowledge-box reader key from the DMS administrator, never the owner service token. Tokens are never shown here.</span></div>` : '<p class="muted">No MCP endpoint reported.</p>'}
      <p class="subtle" style="font-size:.74rem;margin-top:10px">${esc(d.mcp?.note || '')}</p>`;
    const cm = ab.querySelector('#cmcp'); if (cm) cm.onclick = () => copy(mcp);
    const cc = ab.querySelector('#ccc'); if (cc) cc.onclick = () => copy(snippet);
  }
  const db = root.querySelector('#demo');
  const users = u.ok ? (u.data.users || items(u.data)) : [];
  db.innerHTML = users.length ? `<div class="datatable compact"><div class="scroll"><table><thead><tr><th>Email</th><th>Role</th><th>Site</th></tr></thead><tbody>${users.map(x => `<tr><td class="mono">${esc(x.email)}</td><td>${esc(x.title || ROLE_LABEL[x.role] || x.role)}</td><td>${esc(x.siteId || 'All')}</td></tr>`).join('')}</tbody></table></div></div>` : failState(u, { what: 'demo logins', inline: true });
}

function renderMcp(box, r, abs) {
  if (!r.ok) { box.innerHTML = r.status === 404 ? empty({ inline: true, ic: 'plug', title: 'MCP server not in this build yet', body: 'When <code>GET /dms/api/mcp/info</code> is available, this card lists the Streamable HTTP endpoint, the stdio command, every tool, resource and prompt.' }) : failState(r, { what: 'MCP info', inline: true }); return; }
  const d = r.data || {};
  const endpoint = d.endpoint || d.url || d.http?.url || abs('/dms/mcp');
  const stdio = typeof d.stdio === 'string' ? d.stdio : d.stdio ? [d.stdio.command, ...(d.stdio.args || [])].join(' ') : '';
  const tools = d.tools || [];
  const snippet = `claude mcp add harbourline-dms --transport http ${endpoint} --header "Authorization: Bearer <token>"`;
  box.innerHTML = `<div class="grid g2" style="align-items:start"><div class="stack" style="gap:10px">
      <div class="label">Streamable HTTP endpoint</div><div class="copyrow"><code title="${esc(endpoint)}">${esc(endpoint)}</code><button class="btn secondary sm" data-copy="${esc(endpoint)}">Copy MCP endpoint</button></div>
      ${stdio ? `<div class="label">stdio</div><div class="code" style="white-space:pre-wrap">${esc(stdio)}</div>` : ''}
      <div class="label">Connect from Claude Code</div><div class="code" style="white-space:pre-wrap">${esc(snippet)}</div><div class="row"><button class="btn ghost sm" data-copy="${esc(snippet)}">Copy command</button><span class="subtle" style="font-size:.74rem">Use a personal access token (below). Tools run with that token’s role.</span></div>
      ${d.kbMcpUrl ? `<div class="label">Knowledge box MCP endpoint</div><div class="copyrow"><code title="${esc(d.kbMcpUrl)}">${esc(d.kbMcpUrl)}</code><button class="btn ghost sm" data-copy="${esc(d.kbMcpUrl)}">Copy</button></div>` : ''}
      ${(d.resources || []).length ? `<div class="label">Resources · ${d.resources.length}</div><div class="stack" style="gap:4px">${d.resources.map(x => `<div style="font-size:.8rem"><span class="mono">${esc(x.uri || x.name)}</span> <span class="muted">${esc(x.description || x.name || '')}</span></div>`).join('')}</div>` : ''}
      ${(d.prompts || []).length ? `<div class="label">Prompts · ${d.prompts.length}</div><div class="stack" style="gap:4px">${d.prompts.map(x => `<div style="font-size:.8rem"><span class="mono">${esc(x.name)}</span> <span class="muted">${esc(x.description || '')}</span></div>`).join('')}</div>` : ''}
    </div><div class="stack" style="gap:8px"><div class="row"><span class="label">Tools · ${num(d.toolCount ?? tools.length)}</span><input class="input" id="tq" placeholder="Search tools" style="flex:1;height:32px"></div>
      <div class="datatable compact" style="max-height:420px;overflow:auto"><div class="scroll"><table><thead><tr><th>Tool</th><th>Route</th></tr></thead><tbody id="tl">${tools.map(t => `<tr data-q="${esc(`${t.name} ${t.path} ${t.summary || t.description || ''}`.toLowerCase())}"><td><span class="cell-title mono" style="font-size:.76rem">${esc(t.name)}</span><span class="cell-sub" style="white-space:normal">${esc(t.summary || t.description || '')}</span></td><td style="white-space:nowrap"><span class="chip neutral">${esc((t.method || '').toUpperCase())}</span> <span class="mono" style="font-size:.74rem">${esc(t.path || '')}</span></td></tr>`).join('')}</tbody></table></div></div></div></div>`;
  box.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b.dataset.copy));
  const tq = box.querySelector('#tq'); if (tq) tq.oninput = () => { const q = tq.value.toLowerCase(); box.querySelectorAll('#tl tr').forEach(tr => { tr.style.display = tr.dataset.q.includes(q) ? '' : 'none'; }); };
}
async function renderPats(box) {
  const r = await api('/access-tokens');
  if (!r.ok) { box.innerHTML = r.status === 404 ? empty({ inline: true, ic: 'lock', title: 'Access tokens not in this build yet', body: 'When <code>/dms/api/access-tokens</code> is available you can create named tokens for MCP clients and scripts here.' }) : failState(r, { what: 'access tokens', inline: true }); return; }
  const list = items(r.data);
  box.innerHTML = `<form class="row" id="patf"><input class="input" name="name" placeholder="Token name, e.g. Claude Code on my laptop" required style="flex:1;min-width:200px"><button class="btn sm">Create token</button></form><div id="patnew"></div>
    ${list.length ? `<div class="datatable compact"><div class="scroll"><table><thead><tr><th>Name</th><th>Created</th><th>Last used</th><th></th></tr></thead><tbody>${list.map(t => `<tr><td><span class="cell-title">${esc(t.name)}</span><span class="cell-sub mono">${esc(t.prefix || t.id)}…</span></td><td>${dateTime(t.createdAt)}</td><td>${t.lastUsedAt ? dateTime(t.lastUsedAt) : '<span class="subtle">never</span>'}</td><td><button class="btn ghost sm" data-revoke="${esc(t.id)}">Revoke</button></td></tr>`).join('')}</tbody></table></div></div>` : '<p class="muted" style="font-size:.84rem">No tokens yet.</p>'}`;
  box.querySelector('#patf').onsubmit = async e => {
    e.preventDefault(); const name = new FormData(e.target).get('name');
    const y = await api('/access-tokens', { method: 'POST', body: { name } });
    if (!y.ok) return toast(`Couldn’t create (${y.status}): ${y.error}`);
    await renderPats(box);
    const raw = y.data.token || y.data.value;
    box.querySelector('#patnew').innerHTML = `<div class="notice">${'<b>Copy this token now.</b> It won’t be shown again.'}</div><div class="copyrow" style="margin-top:8px"><code>${esc(raw)}</code><button class="btn secondary sm" id="patcopy">Copy</button></div>`;
    box.querySelector('#patcopy').onclick = () => copy(raw);
  };
  box.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { const y = await api('/access-tokens/' + encodeURIComponent(b.dataset.revoke), { method: 'DELETE' }); toast(y.ok ? 'Token revoked' : `Couldn’t revoke: ${y.error}`); if (y.ok) renderPats(box); });
}
