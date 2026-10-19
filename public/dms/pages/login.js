import { api, esc, icon, ROLE_LABEL, tagArag, tagDomo, ann } from '../core.js';
import { signedIn } from '../dms.js';

const DEMO = [
  { email: 'gm@harbourline.demo', role: 'gm', who: 'General manager', scope: 'All four sites, every page' },
  { email: 'sm.par@harbourline.demo', role: 'sales_manager', who: 'Sales manager', scope: 'Parramatta team and pipeline' },
  { email: 'sales1@harbourline.demo', role: 'salesperson', who: 'Salesperson', scope: 'Own leads, test drives and deals' },
  { email: 'marketing@harbourline.demo', role: 'dxm', who: 'Digital experience manager', scope: 'Configurator, promotions, campaigns' },
  { email: 'finance@harbourline.demo', role: 'finance', who: 'Business manager, F&I', scope: 'Deals in finance, trade-ins, documents' },
];

export default async function login(root, { query }) {
  root.innerHTML = `
  <div class="login">
    <section class="hero">
      <div>
        <div class="label" style="color:rgba(255,255,255,.55)">Harbourline Toyota · sales back office</div>
        <h1 style="margin-top:10px">The dealer ERP, with answers built in.</h1>
        <p>Leads from the configurator arrive with everything the customer told us. Domo decides which cars to move; Progress Agentic RAG writes the follow-up, reads the contract and answers questions about the manual and the live pipeline.</p>
      </div>
      <div class="pts">
        <div class="pt"><span class="ic">${icon('leads')}</span><div><b>First-party configurator data</b>Finder answers, cars viewed, offers clicked and the handover sheet, on every lead.</div></div>
        <div class="pt"><span class="ic">${icon('insights')}</span><div><b>Domo signals</b>Days of supply, ageing and target gaps choose what to promote and push. ${tagDomo()}</div></div>
        <div class="pt"><span class="ic">${icon('assistant')}</span><div><b>Grounded AI with citations</b>Deal summaries, follow-ups, document extraction and an ERP agent. ${tagArag()}</div></div>
      </div>
      <div style="font-size:.74rem;color:rgba(255,255,255,.5)">Prototype with synthetic data. Nothing here is a real customer.</div>
    </section>
    <section class="formside">
      <form id="lf" autocomplete="on" novalidate>
        <div><h2 style="font-size:1.35rem">Sign in</h2><p class="muted" style="font-size:.85rem;margin-top:4px">Use a demo account below. The password is filled for you.</p></div>
        <div class="field"><label for="em">Email</label><input class="input" id="em" type="email" name="email" autocomplete="username" required></div>
        <div class="field"><label for="pw">Password</label><input class="input" id="pw" type="password" name="password" autocomplete="current-password" required></div>
        <div class="err" id="lerr" role="alert"></div>
        <button class="btn" type="submit" id="lbtn">Sign in</button>
        <div class="label" style="margin-top:6px">Demo accounts · password demo1234 ${ann('POST /dms/api/auth/login')}</div>
        <div class="demo" id="demo">${DEMO.map(d => `<button type="button" data-email="${d.email}"><span class="av">${esc(d.who.split(/[ ,]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span><span><b>${esc(d.who)}</b><span>${esc(d.scope)}</span></span><span class="r">${esc(d.email.split('@')[0])}</span></button>`).join('')}</div>
      </form>
      <div class="brandnote">Harbourline Toyota · sales and service back office · ${tagArag()} ${tagDomo()}<br>Prototype with synthetic data, prepared for Revolution Software. Nothing here is a real customer.</div>
    </section>
  </div>`;
  const em = root.querySelector('#em'), pw = root.querySelector('#pw'), err = root.querySelector('#lerr'), btn = root.querySelector('#lbtn');
  root.querySelectorAll('#demo button').forEach(b => {
    b.onclick = () => { em.value = b.dataset.email; pw.value = 'demo1234'; root.querySelectorAll('#demo button').forEach(x => x.classList.toggle('on', x === b)); btn.focus(); };
    b.ondblclick = () => root.querySelector('#lf').requestSubmit();
  });
  root.querySelector('#lf').onsubmit = async e => {
    e.preventDefault(); err.textContent = '';
    if (!em.value || !pw.value) { err.textContent = 'Enter an email and password, or pick a demo account.'; return; }
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Signing in…';
    const r = await api('/auth/login', { method: 'POST', body: { email: em.value.trim(), password: pw.value } });
    btn.disabled = false; btn.textContent = 'Sign in';
    if (!r.ok || !r.data?.token) {
      err.innerHTML = r.status === 401 || r.status === 400 ? 'That email and password don’t match a demo account.' : r.status === 0 || r.status >= 500 || r.status === 404 ? `The DMS API isn’t reachable yet (${r.status || 'network'}). It may still be starting; try again in a moment.` : esc(r.error);
      return;
    }
    signedIn(r.data.token, r.data.user);
    location.hash = query.next ? '#/' + query.next : '#/';
  };
}
