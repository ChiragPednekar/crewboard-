#!/usr/bin/env node
// A tiny stand-in for Google's token endpoint + Sheets API, for testing the sync locally
// without a Google account.
//
//   node scripts/mock-google-sheets.mjs            # http://localhost:8787
//   node scripts/mock-google-sheets.mjs --env      # (re)write supabase/.env for the edge runtime
//
// • Verifies the service-account JWT signature (so the real signing code is exercised).
// • Implements values.batchGet / values.batchUpdate / spreadsheets.get / :batchUpdate.
// • Any spreadsheet id works; ids containing "denied" answer 403 like an unshared sheet.
// • Open http://localhost:8787 to see the sheets and edit Status / Link / Notes like a
//   videographer would (edits stamp the hidden "Sheet edited at" column, like the Apps Script).

import { createServer } from 'node:http';
import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.MOCK_SHEETS_PORT ?? 8787);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const keyFile = join(root, 'supabase', '.mock-google-key.pem');
const envFile = join(root, 'supabase', '.env');
const SA_EMAIL = 'crewboard-sync@mock-project.iam.gserviceaccount.com';

// --- key + env -----------------------------------------------------------------
if (!existsSync(keyFile)) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  mkdirSync(dirname(keyFile), { recursive: true });
  writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
}
const privatePem = readFileSync(keyFile, 'utf8');
const publicKey = createPublicKey(privatePem);

if (process.argv.includes('--env')) {
  const host = process.env.MOCK_SHEETS_HOST ?? 'host.docker.internal';
  const sa = { type: 'service_account', client_email: SA_EMAIL, private_key: privatePem, token_uri: `http://${host}:${PORT}/token` };
  const lines = [
    '# Local only (gitignored). Written by scripts/mock-google-sheets.mjs --env',
    `GOOGLE_SERVICE_ACCOUNT_JSON=${JSON.stringify(JSON.stringify(sa))}`,
    `GOOGLE_SHEETS_API_BASE=http://${host}:${PORT}/v4`,
    `SYNC_CRON_SECRET=local-dev-sync-secret`,
    '',
  ];
  writeFileSync(envFile, lines.join('\n'), { mode: 0o600 });
  console.log(`Wrote ${envFile}. Restart the edge runtime: docker restart supabase_edge_runtime_crewboard`);
  process.exit(0);
}

// --- state -----------------------------------------------------------------------
/** spreadsheetId → { tabs: Map<title, { sheetId, grid: string[][], protected: [] }> } */
const books = new Map();
let nextSheetId = 100;
const book = (id) => {
  if (!books.has(id)) books.set(id, { tabs: new Map([['Sheet1', { sheetId: 0, grid: [], protected: [] }]]) });
  return books.get(id);
};
const colIndex = (letters) => [...letters.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
function parseRange(a1) {
  const m = a1.match(/^(?:'((?:[^']|'')+)'|([^!]+))!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/);
  if (!m) throw new Error(`Bad range ${a1}`);
  return { tab: (m[1] ?? m[2]).replace(/''/g, "'"), c0: colIndex(m[3]), r0: m[4] ? Number(m[4]) - 1 : 0, c1: m[5] ? colIndex(m[5]) : colIndex(m[3]), r1: m[6] ? Number(m[6]) - 1 : null };
}

// --- helpers ---------------------------------------------------------------------
const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readBody = (req) =>
  new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => resolve(d));
  });
const b64urlDecode = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function verifyJwt(assertion) {
  const [h, p, sig] = assertion.split('.');
  const v = createVerify('RSA-SHA256');
  v.update(`${h}.${p}`);
  if (!v.verify(publicKey, b64urlDecode(sig))) return 'bad signature';
  const claims = JSON.parse(b64urlDecode(p).toString());
  if (claims.iss !== SA_EMAIL) return 'wrong iss';
  if (!String(claims.scope).includes('spreadsheets')) return 'missing scope';
  if (claims.exp < Date.now() / 1000) return 'expired';
  return null;
}

// --- server ----------------------------------------------------------------------
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});

    if (url.pathname === '/token' && req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      const problem = verifyJwt(form.get('assertion') ?? '');
      if (problem) return send(res, 401, { error: 'invalid_grant', error_description: problem });
      return send(res, 200, { access_token: 'mock-access-token', expires_in: 3600, token_type: 'Bearer' });
    }

    if (url.pathname.startsWith('/v4/')) {
      if (req.headers.authorization !== 'Bearer mock-access-token') return send(res, 401, { error: { message: 'Unauthenticated' } });
      const m = url.pathname.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);
      if (!m) return send(res, 404, { error: { message: 'Not found' } });
      const id = decodeURIComponent(m[1]);
      if (id.includes('denied')) return send(res, 403, { error: { message: 'The caller does not have permission' } });
      const b = book(id);
      const rest = m[2];

      if (rest === '' && req.method === 'GET') {
        return send(res, 200, {
          sheets: [...b.tabs].map(([title, t]) => ({
            properties: { sheetId: t.sheetId, title },
            protectedRanges: t.protected.map((p) => ({ protectedRangeId: p.id, description: p.description })),
          })),
        });
      }
      if (rest === ':batchUpdate' && req.method === 'POST') {
        const { requests } = JSON.parse(await readBody(req));
        const replies = [];
        for (const r of requests) {
          if (r.addSheet) {
            const title = r.addSheet.properties.title;
            const sheetId = nextSheetId++;
            b.tabs.set(title, { sheetId, grid: [], protected: [] });
            replies.push({ addSheet: { properties: { sheetId, title } } });
          } else if (r.addProtectedRange) {
            const p = r.addProtectedRange.protectedRange;
            const tab = [...b.tabs.values()].find((t) => t.sheetId === p.range.sheetId);
            tab?.protected.push({ id: nextSheetId++, description: p.description, editors: p.editors?.users ?? [] });
            replies.push({});
          } else if (r.deleteProtectedRange) {
            for (const t of b.tabs.values()) t.protected = t.protected.filter((p) => p.id !== r.deleteProtectedRange.protectedRangeId);
            replies.push({});
          } else replies.push({});
        }
        return send(res, 200, { replies });
      }
      if (rest === '/values:batchGet' && req.method === 'GET') {
        const ranges = url.searchParams.getAll('ranges');
        return send(res, 200, {
          valueRanges: ranges.map((a1) => {
            const { tab } = parseRange(a1);
            const t = b.tabs.get(tab);
            if (!t) throw Object.assign(new Error(`Unable to parse range: ${a1}`), { status: 400 });
            const values = t.grid.map((row) => {
              const out = row.map((c) => c ?? '');
              while (out.length && out[out.length - 1] === '') out.pop();
              return out;
            });
            while (values.length && values[values.length - 1].length === 0) values.pop();
            return { range: a1, values };
          }),
        });
      }
      if (rest === '/values:batchUpdate' && req.method === 'POST') {
        const { data } = JSON.parse(await readBody(req));
        for (const { range, values } of data) {
          const { tab, c0, r0 } = parseRange(range);
          const t = b.tabs.get(tab);
          if (!t) return send(res, 400, { error: { message: `No tab ${tab}` } });
          values.forEach((row, i) => {
            while (t.grid.length <= r0 + i) t.grid.push([]);
            row.forEach((v, j) => (t.grid[r0 + i][c0 + j] = String(v)));
          });
        }
        return send(res, 200, { totalUpdatedCells: data.length });
      }
      return send(res, 404, { error: { message: `Unsupported ${req.method} ${rest}` } });
    }

    // --- test helpers + viewer ---------------------------------------------------
    if (url.pathname === '/__edit' && req.method === 'POST') {
      const { spreadsheetId, tab, row, col, value } = JSON.parse(await readBody(req));
      const t = book(spreadsheetId).tabs.get(tab);
      if (!t) return send(res, 404, { error: 'no such tab' });
      while (t.grid.length < row) t.grid.push([]);
      t.grid[row - 1][col] = value;
      if ([8, 9, 10].includes(col)) t.grid[row - 1][14] = new Date().toISOString(); // Apps Script stamp
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/__state') {
      return send(res, 200, Object.fromEntries([...books].map(([id, b]) => [id, Object.fromEntries([...b.tabs].map(([n, t]) => [n, { grid: t.grid, protected: t.protected }]))])));
    }
    if (url.pathname === '/') return send(res, 200, VIEWER, 'text/html; charset=utf-8');
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, e.status ?? 500, { error: { message: e.message } });
  }
});

const VIEWER = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock Google Sheets</title>
<style>
body{font:14px system-ui;margin:16px;background:#f7f6f3;color:#16161d}h1{font-size:18px}h2{font-size:15px;margin:24px 0 8px}
.wrap{overflow:auto;border:1px solid #ddd;background:#fff}table{border-collapse:collapse;font-size:12px}
td,th{border:1px solid #e4e1da;padding:4px 6px;max-width:220px;vertical-align:top;white-space:pre-wrap}
th{background:#f1efea;position:sticky;top:0}td.edit{background:#fffbe6;cursor:text}td.edit:focus{outline:2px solid #f5a524}
.muted{color:#5e5e6b}
</style>
<h1>Mock Google Sheets <span class="muted">— edit the yellow cells (Status, Deliverable link, Notes), then press “Sync now” in CrewBoard</span></h1>
<div id="app"></div>
<script>
async function load(){
  const s=await (await fetch('/__state')).json(); const app=document.getElementById('app'); app.innerHTML='';
  for(const [id,tabs] of Object.entries(s)) for(const [tab,{grid}] of Object.entries(tabs)){
    if(!grid.length) continue;
    const h=document.createElement('h2'); h.textContent=id+' › '+tab; app.append(h);
    const w=document.createElement('div'); w.className='wrap'; const t=document.createElement('table'); w.append(t); app.append(w);
    grid.forEach((row,r)=>{const tr=t.insertRow(); for(let c=0;c<15;c++){const td=r===0?document.createElement('th'):tr.insertCell(); if(r===0) tr.append(td);
      td.textContent=row[c]??''; if(r>0&&[8,9,10].includes(c)){td.className='edit';td.contentEditable=true;
      td.onblur=()=>fetch('/__edit',{method:'POST',body:JSON.stringify({spreadsheetId:id,tab,row:r+1,col:c,value:td.innerText.trim()})}).then(load);}}});
  }
  if(!app.children.length) app.textContent='No data yet. Connect a sheet in CrewBoard → Settings → Google Sheets and press Set up.';
}
load(); setInterval(()=>{ if(!document.activeElement||document.activeElement.tagName!=='TD') load(); },5000);
</script>`;

server.listen(PORT, () => console.log(`Mock Google Sheets on http://localhost:${PORT}  (service account ${SA_EMAIL})`));
