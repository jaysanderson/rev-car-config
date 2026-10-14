// openapi.mjs — OpenAPI 3.0 document generated from the DMS route table, and an
// inline HTML page that renders it (no external scripts).
import * as db from './db.mjs';

const LIST_PARAMS = ['q', 'siteId', 'status', 'from', 'to', 'sort', 'page', 'pageSize'];
const PARAM_DESC = {
  q: 'Free-text search over all fields', siteId: 'Site id (par|hor|pen|liv); forced to the user\'s site for site-scoped roles', status: 'Status / stage filter (comma = any of)',
  from: 'From date (inclusive, YYYY-MM-DD) on the table\'s date field', to: 'To date (inclusive)', sort: 'field or -field', page: '1-based page', pageSize: 'Rows per page (≤ 500, default 25)',
  month: 'YYYY-MM (default: current month)', metric: 'units|gross|avg_gross|leads|test_drives|conversion|lost|front_gross|back_gross', by: 'month|week', token: 'Bearer token (CSV links only)',
};

function typeOfCol(name) { return /^(id|.*Id|.*At|.*Date|when|month|stockNo|vin|email|phone|name|title|kind|status|stage|channel|source|model|grade|colour|interior|suburb|postcode|lender|condition|make|fileName|firstName|lastName|role|address|reasonCode|audience)$/.test(name) ? { type: 'string' } : /\[\]$/.test(name) ? { type: 'array', items: {} } : /\{/.test(name) ? { type: 'object' } : { type: 'number' }; }
function tableSchema(t) {
  const props = {};
  for (const raw of db.TABLES[t].cols.split(/,\s*(?![^{(]*[})])/)) {
    const name = raw.trim().split(/[\s({[]/)[0];
    if (!name) continue;
    const enumM = /\(([a-z_|-]+(?:\|[a-z_ -]+)+)\)/i.exec(raw);
    const s = raw.includes('[]') ? { type: 'array', items: {} } : raw.includes('{') ? { type: 'object' } : typeOfCol(name);
    if (enumM && s.type === 'string') s.enum = enumM[1].split('|').map((x) => x.trim());
    if (raw.includes('(') && !enumM) s.description = raw.slice(raw.indexOf('(') + 1, raw.lastIndexOf(')'));
    props[name] = s;
  }
  return { type: 'object', properties: props, additionalProperties: true };
}

export function openapi(routes, { version, serverUrl = '/dms/api' } = {}) {
  const paths = {};
  for (const r of routes) {
    const p = r.path.replace(/:([A-Za-z]+)(\.csv)?/g, (_, n, ext) => `{${n}}${ext || ''}`);
    const params = [...(r.path.match(/:([A-Za-z]+)/g) || []).map((x) => ({ name: x.slice(1), in: 'path', required: true, schema: { type: 'string' } })),
      ...(r.list ? LIST_PARAMS : []).concat(r.query || []).map((n) => ({ name: n, in: 'query', required: false, schema: { type: /^(page|pageSize)$/.test(n) ? 'integer' : 'string' }, description: PARAM_DESC[n] || '' }))];
    const op = {
      tags: [r.tag], summary: r.summary, operationId: `${r.method}${p.replace(/[{}.]/g, '').replace(/\/(\w)/g, (_, c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, '')}`,
      description: [r.description, r.cap ? `Requires capability \`${r.cap}\`.` : null, r.arag ? 'Powered by Progress Agentic RAG.' : null].filter(Boolean).join(' '),
      parameters: params.length ? params : undefined,
      security: r.auth === false ? [] : [{ bearer: [] }],
      responses: {
        200: { description: 'OK', content: r.csv ? { 'text/csv': { schema: { type: 'string' } } } : r.pdf ? { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } : r.html ? { 'text/html': { schema: { type: 'string' } } } : { 'application/json': { schema: r.list ? { $ref: '#/components/schemas/Page' } : r.table ? { $ref: `#/components/schemas/${r.table}` } : { type: 'object' } } } },
        ...(r.auth === false ? {} : { 401: { description: 'Missing or invalid token' }, 403: { description: 'Role not allowed' } }),
        ...(r.body ? { 400: { description: 'Invalid body' } } : {}),
        ...(r.path.includes(':') ? { 404: { description: 'Not found' } } : {}),
        ...(r.arag ? { 429: { description: 'Rate limited' }, 502: { description: 'Knowledge box unavailable' } } : {}),
      },
    };
    if (r.body) op.requestBody = { required: true, content: { 'application/json': { schema: r.body } } };
    (paths[p] ||= {})[r.method] = op;
  }
  return {
    openapi: '3.0.3',
    info: { title: 'Harbourline DMS API', version: version || '1.0.0', description: 'Sales back-office API for Harbourline Toyota (prototype). Bearer auth: POST /auth/login with a demo user (password demo1234). Lists return {items,total,page,pageSize}; any extra query parameter named after a column is an equality filter (comma = any of).' },
    servers: [{ url: serverUrl }],
    tags: [...new Set(routes.map((r) => r.tag))].map((name) => ({ name })),
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      schemas: {
        Page: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' } }, required: ['items', 'total', 'page', 'pageSize'] },
        ...Object.fromEntries(Object.keys(db.TABLES).map((t) => [t, tableSchema(t)])),
      },
    },
    paths,
  };
}

export const DOCS_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Harbourline DMS API</title><style>
:root{--ink:#0b1b2b;--bg:#f6f7f9;--card:#fff;--line:#e3e6ea;--muted:#5b6673;--get:#0b7a4b;--post:#1d4ed8;--patch:#a15c00;--delete:#b42318}
@media (prefers-color-scheme:dark){:root{--ink:#e8edf2;--bg:#0e141b;--card:#16202b;--line:#273443;--muted:#9aa7b4}}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
header{background:#0b1b2b;color:#fff;padding:18px 16px}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;color:#b8c4d0}
main{max-width:1000px;margin:0 auto;padding:16px}h2{margin:28px 0 8px;font-size:16px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
details{background:var(--card);border:1px solid var(--line);border-radius:8px;margin:6px 0}summary{cursor:pointer;padding:10px 12px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.m{font:600 11px/1 ui-monospace,monospace;color:#fff;padding:4px 6px;border-radius:4px;min-width:52px;text-align:center}.get{background:var(--get)}.post{background:var(--post)}.patch{background:var(--patch)}.delete{background:var(--delete)}
code,.p{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.p{font-weight:600;word-break:break-all}.s{color:var(--muted)}.body{padding:0 12px 12px;border-top:1px solid var(--line)}
table{border-collapse:collapse;width:100%;margin:8px 0}td,th{text-align:left;padding:4px 8px;border-bottom:1px solid var(--line);vertical-align:top}pre{background:var(--bg);padding:8px;border-radius:6px;overflow:auto;max-height:320px}
.tag{font-size:11px;border:1px solid var(--line);border-radius:10px;padding:1px 8px;color:var(--muted)}
</style></head><body><header><h1>Harbourline DMS API</h1><p>Generated from <a style="color:#9cd" href="openapi.json">openapi.json</a> · Bearer auth via POST /auth/login</p></header><main id="root">Loading…</main>
<script>
fetch('openapi.json').then(r=>r.json()).then(spec=>{
  const root=document.getElementById('root');root.textContent='';
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const intro=document.createElement('p');intro.innerHTML=esc(spec.info.description);root.appendChild(intro);
  const byTag={};for(const [p,ops] of Object.entries(spec.paths))for(const [m,op] of Object.entries(ops))(byTag[op.tags[0]]||=[]).push([m,p,op]);
  for(const [tag,ops] of Object.entries(byTag)){const h=document.createElement('h2');h.textContent=tag;root.appendChild(h);
    for(const [m,p,op] of ops){const d=document.createElement('details');
      const params=(op.parameters||[]).map(x=>'<tr><td><code>'+esc(x.name)+'</code></td><td>'+x.in+'</td><td>'+esc(x.description||'')+'</td></tr>').join('');
      const body=op.requestBody?'<p><b>Body</b></p><pre>'+esc(JSON.stringify(op.requestBody.content['application/json'].schema,null,2))+'</pre>':'';
      d.innerHTML='<summary><span class="m '+m+'">'+m.toUpperCase()+'</span><span class="p">'+esc(p)+'</span><span class="s">'+esc(op.summary)+'</span>'+(op.security&&op.security.length?'':'<span class="tag">public</span>')+'</summary><div class="body"><p>'+esc(op.description||'')+'</p>'+(params?'<table><tr><th>Parameter</th><th>In</th><th>Description</th></tr>'+params+'</table>':'')+body+'<p class="s">Responses: '+Object.entries(op.responses).map(([c,r])=>c+' '+esc(r.description)).join(' · ')+'</p></div>';
      root.appendChild(d);}}
}).catch(e=>{document.getElementById('root').textContent='Could not load openapi.json: '+e.message;});
</script></body></html>`;
