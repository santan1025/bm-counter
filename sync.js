// ═══════════════════════════════════════════════════════════════════════════
// SYNC LAYER
// ═══════════════════════════════════════════════════════════════════════════
// Every screen reads and writes through Sync instead of touching localStorage directly.
// Two modes, one API:
//   local — localStorage, plus BroadcastChannel so two tabs on one device still agree.
//   live  — Supabase: initial read, realtime subscription, writes echoed to every device.
//
// Writes never block on the network: a write lands in localStorage first and is queued for
// the server, because the shop has no wifi and the SIM data drops — a bill must not fail
// because a tower did.
//
// CONNECTING DEVICES — the thing that was silently broken.
// The keys used to be expected either in supabase-config.js (left as PASTE placeholders)
// or in localStorage on a device that had opened the counter app's Sync settings. On a
// second phone or the kitchen laptop neither was true, so every screen ran in local mode,
// showed a small "this device only" pill nobody reads, and looked like sync was on when
// nothing was shared. Now:
//   1. keys travel in the link — open any screen with #k=<base64 url|key> and that device
//      configures itself and reloads. One link, four phones, nothing typed.
//   2. a device that is NOT connected says so across the bottom of the screen, in words,
//      until it is fixed. Silence was the bug.

(function () {
  const TABLES = ['requests', 'dispatches', 'cm_sales', 'stock', 'special_orders', 'punches', 'notifications', 'expenses', 'damage', 'daybook', 'staff_accounts', 'cm_shops'];
  const LKEY = t => 'cs9_sync_' + t;
  const QKEY = 'cs9_sync_queue';
  const CKEY = 'cs9_sync';

  function saveKeys(url, key) {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(CKEY)) || {}; } catch (e) {}
    cfg.url = url; cfg.key = key; cfg.on = true;
    try { localStorage.setItem(CKEY, JSON.stringify(cfg)); } catch (e) {}
  }

  const b64 = {
    enc: s => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    dec: s => atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  };

  // A setup link, opened on any phone. Keys are taken out of the address bar straight
  // away so the next person to pick up the phone cannot read them out of history.
  function keysFromLink() {
    const m = (location.hash + '&' + location.search).match(/[#?&]k=([A-Za-z0-9+/=_-]+)/);
    if (!m) return null;
    try {
      const parts = b64.dec(m[1]).split('|');
      if (parts[0] && parts[1]) {
        saveKeys(parts[0].trim(), parts[1].trim());
        const clean = location.pathname + location.search.replace(/([?&])k=[^&]*/, '$1').replace(/[?&]$/, '');
        history.replaceState(null, '', clean);
        return true;
      }
    } catch (e) {}
    return null;
  }
  keysFromLink();

  // Last-resort copy of the keys, inside the file that needs them. supabase-config.js is a
  // separate request: an old copy of it in a phone's cache, a host that did not upload it, or
  // a file:// open where it silently fails, and the app declared itself unconnected and asked
  // for a setup link — which is exactly what happened on a real phone. The app should never
  // ask a shop for keys it already ships with.
  const BUILT_IN = {
    url: 'https://lrbdipbzsyxalyxqzmxq.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyYmRpcGJ6c3l4YWx5eHF6bXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNTcwMDUsImV4cCI6MjA5ODkzMzAwNX0.pXhRK5B_WCFqQd2gctoX18liQDOsoNS4cy7hXdYEGeU'
  };

  function resolveConfig() {
    try {
      const s = JSON.parse(localStorage.getItem(CKEY)) || {};
      if (s.url && s.key && s.url.indexOf('PASTE') < 0) return { url: s.url, anonKey: s.key, from: 'this device' };
    } catch (e) {}
    const f = window.SUPABASE_CONFIG || {};
    if (f.url && f.anonKey && f.url.indexOf('PASTE') < 0) return { url: f.url, anonKey: f.anonKey, from: 'config file' };
    return { url: BUILT_IN.url, anonKey: BUILT_IN.anonKey, from: 'built in' };
  }
  const CFG = resolveConfig();
  const live = !!(CFG.url && CFG.anonKey);

  let client = null;
  let status = live ? 'connecting' : 'local';
  // Tables the project does not have yet. A missing table is a setup step, not a fault, and
  // it must be SAID: the roster rows failed to upsert, sat in the retry queue forever, and
  // the screen still read "Connected — 5 waiting", which to a shop owner looks like five
  // lost bills. Rows for a missing table are kept on the device and never queued.
  const missing = new Set();
  // Why each table is unusable. "Not created yet" and "created, but by another project with
  // different columns" are both setup steps, and both arrive as an error containing the words
  // "does not exist" — but they read completely differently to whoever has to fix it.
  const reason = new Map();
  let lastReason = '';
  // Two of this app's tables live in a project shared with another app, whose sales and
  // staff tables are uuid-keyed and cannot hold our rows. Ours are created by app-tables.sql.
  const SQL_FOR = t => ((t === 'staff_accounts' || t === 'cm_sales' || t === 'cm_shops') ? 'app-tables.sql' : 'supabase-schema.sql');
  const statusCbs = [];
  // Tables whose server contents have actually been READ at least once this session. An
  // empty local mirror means nothing until the table appears here: before the first read
  // it means "not loaded yet", and code that mistakes that for "the table is empty" will
  // helpfully write its defaults over everybody's real rows.
  const fetched = new Set();
  // Set once the boot read of every table has finished, errors and all. Distinct from
  // `fetched`, which is per-table success.
  let firstSweepDone = false;
  const subs = {};
  let bc = null;
  try { bc = new BroadcastChannel('cs9_sync'); } catch (e) { bc = null; }

  const readLocal = t => { try { return JSON.parse(localStorage.getItem(LKEY(t))) || []; } catch (e) { return []; } };
  const writeLocal = (t, rows) => { try { localStorage.setItem(LKEY(t), JSON.stringify(rows)); return true; } catch (e) { return false; } };

  // A missing table outranks "live": there is a job to do and the words have to keep saying
  // so until it is done.
  function setStatus(s, detail) {
    if (missing.size && (s === 'live' || s === 'behind')) s = 'setup';
    // Built here rather than at each call site: the status arrives as 'setup' from three
    // different places, and the two that fire on a normal page load were passing no detail
    // at all — leaving a bar that said "one setup step left" without saying which.
    if (s === 'setup' && !detail && missing.size) {
      const t = Array.from(missing)[0];
      const why = reason.get(t);
      detail = why === 'columns'
        ? 'the “' + t + '” table exists but is missing columns this app needs — run ' + SQL_FOR(t) + ' in Supabase → SQL Editor (it only adds what is absent)'
        : why === 'unusable'
        ? 'the “' + t + '” table will not accept this app’s rows — run ' + SQL_FOR(t) + ' in Supabase → SQL Editor. The database said: ' + lastReason
        : 'the “' + t + '” table is not in the database yet — run ' + SQL_FOR(t) + ' in Supabase → SQL Editor';
    }
    status = s;
    statusCbs.forEach(cb => { try { cb(s, detail); } catch (e) {} });
    banner(s, detail);
  }

  function emit(t, origin) {
    (subs[t] || []).forEach(cb => { try { cb(readLocal(t), origin); } catch (e) {} });
  }

  if (bc) bc.onmessage = e => { if (e.data && e.data.table) emit(e.data.table, 'other-tab'); };
  window.addEventListener('storage', e => {
    if (!e.key) return;
    const t = TABLES.find(x => LKEY(x) === e.key);
    if (t) emit(t, 'other-tab');
  });

  // ── the unmissable warning ───────────────────────────────────────────────
  // A shop that thinks it is sharing data and is not will find out at the day close, from
  // figures that disagree. This says it now, on every screen, in plain words.
  let bar = null;
  function banner(s, detail) {
    const bad = (s === 'local' || s === 'setup');
    if (!bad) { if (bar) bar.style.display = 'none'; return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.setAttribute('data-sync-banner', '');
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#8a1c1c;color:#fff;'
        + 'font:600 12.5px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:10px 14px;'
        + 'display:flex;align-items:center;gap:10px;cursor:pointer;box-shadow:0 -3px 14px rgba(0,0,0,.25)';
      bar.onclick = askKeys;
      document.addEventListener('DOMContentLoaded', () => document.body.appendChild(bar));
      if (document.body) document.body.appendChild(bar);
    }
    bar.style.display = 'flex';
    // Two different messages, because they are two different problems: nothing is shared at
    // all, versus one table is not made yet and everything else is fine.
    bar.style.background = (s === 'setup') ? '#8a5a12' : '#8a1c1c';
    bar.onclick = (s === 'setup') ? null : askKeys;
    bar.style.cursor = (s === 'setup') ? 'default' : 'pointer';
    bar.innerHTML = (s === 'setup')
      ? '<span style="font-size:15px">⚙</span><span style="flex:1">One setup step left'
        + (detail ? ' — ' + detail : '') + '</span>'
      : '<span style="font-size:15px">⚠</span><span style="flex:1">Not connected — nothing on this device is shared with the kitchen or the other shops.'
        + (detail ? '<br><span style="font-weight:500;opacity:.85">' + detail + '</span>' : '')
        + '</span><span style="text-decoration:underline;white-space:nowrap">Connect</span>';
  }

  function askKeys() {
    const pasted = prompt('Paste the setup link from the first phone,\nor the Supabase Project URL.');
    if (!pasted) return;
    const t = pasted.trim();
    const m = t.match(/[#?&]k=([A-Za-z0-9+/=_-]+)/);
    if (m) {
      try {
        const p = b64.dec(m[1]).split('|');
        if (p[0] && p[1]) { saveKeys(p[0].trim(), p[1].trim()); location.reload(); return; }
      } catch (e) {}
      alert('That link is not a valid setup link.');
      return;
    }
    if (!/^https:\/\/.+\.supabase\.co/.test(t)) { alert('That is not a project URL or a setup link.'); return; }
    const key = prompt('Now paste the "anon public" key.');
    if (!key) return;
    if (/service_role/i.test(key)) { alert('That is the service_role key — it must never go in the app.'); return; }
    if (key.trim().length < 40) { alert('That key looks too short.'); return; }
    saveKeys(t.replace(/\/+$/, ''), key.trim());
    location.reload();
  }

  // ── merge ────────────────────────────────────────────────────────────────
  function mergeRow(t, row) {
    const rows = readLocal(t);
    const i = rows.findIndex(r => String(r.id) === String(row.id));
    if (i < 0) rows.push(row);
    else if (!rows[i].updated_at || !row.updated_at || row.updated_at >= rows[i].updated_at) rows[i] = Object.assign({}, rows[i], row);
    writeLocal(t, rows);
    return rows;
  }

  // Does this error mean the table is not there? Postgres says 42P01; PostgREST wraps it in
  // prose. Either way it is not worth retrying every twenty seconds until someone runs SQL.
  // 42703 is a missing COLUMN, and its message also says "does not exist" — read as a
  // missing table it sent the user to create a table that was already there.
  function classify(error) {
    if (!error) return null;
    const code = String(error.code || '');
    const msg = String(error.message || '') + ' ' + String(error.details || '') + ' ' + String(error.hint || '');
    if (code === '42703' || /column .* does not exist|could not find the '.*' column/i.test(msg)) return 'columns';
    if (code === '42P01' || code === 'PGRST205' || /could not find the table|relation .* does not exist|schema cache/i.test(msg)) return 'missing';
    if (/does not exist/i.test(msg)) return 'missing';
    // Wrong column type, a not-null or foreign key this app knows nothing about: retrying
    // cannot fix it, and a queue that never drains reads as unsaved bills.
    if (/^(22|42804|23502|23503|23505|23514)/.test(code) || /invalid input syntax|violates .* constraint|cannot be cast/i.test(msg)) {
      lastReason = msg.trim().replace(/\s+/g, ' ').slice(0, 160);
      return 'unusable';
    }
    return null;
  }

  function noteFailure(t, error) {
    const why = classify(error);
    if (!why) return false;
    missing.add(t);
    reason.set(t, why);
    // Anything already queued for that table is dropped: it cannot succeed, and left in the
    // queue it reads as data waiting to be saved.
    try {
      const q = (JSON.parse(localStorage.getItem(QKEY)) || []).filter(x => x.table !== t);
      localStorage.setItem(QKEY, JSON.stringify(q));
    } catch (e) {}
    setStatus('setup');
    return true;
  }

  // The server returns at most 1000 rows per request, silently. A plain select('*') on a
  // table that has grown past that therefore returns a TRUNCATED list with no error — and
  // the mirror below replaces the device's rows with it, so older sales quietly vanish from
  // the phone and from every total on every screen. cm_sales reading exactly 1000 was that,
  // not a coincidence. Read in pages until a short page says we have reached the end.
  async function readAll(t) {
    const PAGE = 1000;
    const out = [];
    for (let from = 0; from < 500000; from += PAGE) {
      const { data, error } = await client.from(t).select('*').range(from, from + PAGE - 1);
      if (error) return { data: null, error };
      out.push.apply(out, data);
      if (data.length < PAGE) break;
    }
    return { data: out, error: null };
  }

  function queuePush(t, row) {
    if (missing.has(t)) return;
    let q = [];
    try { q = JSON.parse(localStorage.getItem(QKEY)) || []; } catch (e) {}
    q = q.filter(x => !(x.table === t && String(x.row.id) === String(row.id)));
    q.push({ table: t, row: row });
    try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) {}
  }

  // One flush at a time. This used to be re-entrant: setInterval fired every 20s, a second
  // run read the same queue while the first was still working, and whichever finished last
  // wrote its own idea of "what is left" over the other's — resurrecting rows that had
  // already landed. With one round trip per row, a queue of a couple of thousand could
  // never drain: it kept being put back. Rows are sent in batches now, and progress is
  // saved after every batch, so closing the app mid-flush keeps what already went.
  let flushing = false;

  async function flushQueue() {
    if (!client || flushing) return;
    flushing = true;
    try {
      let q = [];
      try { q = JSON.parse(localStorage.getItem(QKEY)) || []; } catch (e) {}
      if (!q.length) return;
      const failed = [];
      let i = 0;
      while (i < q.length) {
        const t = q[i].table;
        const chunk = [];
        while (i < q.length && q[i].table === t && chunk.length < 200) { chunk.push(q[i]); i++; }
        if (missing.has(t)) continue;
        const { error } = await client.from(t).upsert(chunk.map(x => x.row));
        if (error && !noteFailure(t, error)) {
          // One bad row must not hold up the 199 good ones behind it, so a failed batch
          // is retried row by row and only the genuinely broken rows stay queued.
          for (const item of chunk) {
            const r = await client.from(t).upsert(item.row);
            if (r.error && !noteFailure(t, r.error)) failed.push(item);
          }
        }
        const left = failed.concat(q.slice(i));
        try { localStorage.setItem(QKEY, JSON.stringify(left)); } catch (e) {}
        setStatus(left.length ? 'behind' : 'live', left.length ? left.length + ' waiting' : '');
      }
    } finally {
      flushing = false;
    }
  }

  // ── test-data purge ──────────────────────────────────────────────────────
  // Seeded rows are gone from the code, but they are still sitting in the tables and in
  // localStorage on every device that loaded them. This clears them out on sight, locally
  // and on the server, so no invented cake ever reaches a real invoice or report.
  const isTest = r => !!(r && (r.demo || r.is_test || r.__seed
    || /^(seed|demo|test)[-:]/i.test(String(r.id || ''))));

  function purgeTests() {
    let n = 0;
    TABLES.forEach(t => {
      const rows = readLocal(t);
      const dead = rows.filter(isTest).map(r => String(r.id));
      if (!dead.length) return;
      n += dead.length;
      writeLocal(t, rows.filter(r => !isTest(r)));
      emit(t, 'self');
      if (client) {
        for (let i = 0; i < dead.length; i += 200) client.from(t).delete().in('id', dead.slice(i, i + 200));
      }
    });
    if (n && bc) try { bc.postMessage({ table: 'requests' }); } catch (e) {}
    return n;
  }

  // ── live mode ────────────────────────────────────────────────────────────
  // The library is fetched from a public CDN, and a CDN is a single point of failure: one
  // wrong security header, one blocked host, and the whole system silently runs each phone
  // alone. So there are three sources. Any one of them working is enough.
  const LIB_SOURCES = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
    'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js',
    'https://esm.sh/@supabase/supabase-js@2/dist/umd/supabase.js'
  ];
  let libFrom = '';

  async function loadLibrary() {
    if (window.supabase) return true;
    const tried = [];
    for (const src of LIB_SOURCES) {
      try {
        await loadScript(src);
        if (window.supabase) {
          libFrom = src.split('/')[2];
          return true;
        }
        tried.push(src.split('/')[2] + ' (loaded but empty)');
      } catch (e) {
        tried.push(src.split('/')[2] + ' (blocked)');
      }
    }
    libFrom = 'none: ' + tried.join(', ');
    return false;
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('script load failed'));
      document.head.appendChild(s);
    });
  }

  async function initLive() {
    try {
      if (!window.supabase) {
        const got = await loadLibrary();
        if (!got) {
          // This exact failure cost an evening: the host's Content-Security-Policy allowed
          // scripts from 'self' only, the library never loaded, and the app reported it as
          // "cannot reach the backend" — which sent everyone looking at keys and wifi.
          setStatus('local', 'the database library could not load from any source — '
            + libFrom + '. The site\'s security headers (_headers / netlify.toml) must allow '
            + 'cdn.jsdelivr.net, unpkg.com and esm.sh under script-src, plus wss://*.supabase.co '
            + 'under connect-src. If those files are in the deploy but not at its ROOT, they are ignored.');
          firstSweepDone = true;
          return;
        }
      }
      // Auth is switched OFF on this client, deliberately and explicitly.
      //
      // google.js runs its own client for identity. A Supabase client defaults to
      // detectSessionInUrl: true, so with two clients on one page BOTH of them tried to
      // exchange the single one-time ?code= that Google returns. This one has no PKCE
      // verifier — google.js stored that under its own key — so its attempt failed and
      // consumed the code, and the real sign-in then died on a spent code with
      // "Invalid login credentials". This client moves shop records and has no business
      // touching anybody's identity.
      client = window.supabase.createClient(CFG.url, CFG.anonKey, {
        realtime: { params: { eventsPerSecond: 10 } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'cs9_sync_noauth' }
      });

      // Prove the connection before claiming it. A wrong key, a paused project or a table
      // that was never created used to fail per-table and leave the screen saying "Live".
      const probe = await client.from('requests').select('id').limit(1);
      if (probe.error) {
        setStatus('local', probe.error.message);
        return;
      }

      for (const t of TABLES) {
        const { data, error } = await readAll(t);
        if (error) noteFailure(t, error);
        if (!error && data) {
          fetched.add(t);
          const localRows = readLocal(t);
          const serverIds = new Set(data.map(r => String(r.id)));
          const keep = localRows.filter(r => !serverIds.has(String(r.id)) && r.__pending);
          writeLocal(t, data.concat(keep));
          emit(t, 'server');
        }
        client.channel('rt_' + t)
          .on('postgres_changes', { event: '*', schema: 'public', table: t }, payload => {
            const row = payload.new && payload.new.id ? payload.new : payload.old;
            if (!row) return;
            if (payload.eventType === 'DELETE' || payload.event === 'DELETE') {
              writeLocal(t, readLocal(t).filter(r => String(r.id) !== String(row.id)));
            } else {
              mergeRow(t, row);
            }
            emit(t, 'server');
          })
          .subscribe();
      }
      // The first read sweep is now OVER, whatever each individual table did. This is the
      // honest terminal signal: after this point an empty mirror is an answer, not a wait.
      // Per-table success is not that signal — a missing table or a permissions rule means
      // one table never succeeds, and anything waiting on it would wait forever.
      firstSweepDone = true;
      setStatus('live');
      purgeTests();
      await flushQueue();
      window.addEventListener('online', flushQueue);
      setInterval(flushQueue, 20000);
    } catch (e) {
      firstSweepDone = true;
      setStatus('local', 'cannot reach the database: ' + String((e && e.message) || e));
    }
  }

  // ── public API ───────────────────────────────────────────────────────────
  window.Sync = {
    tables: TABLES,
    get keySource() { return CFG.from || 'none'; },
    // Which CDN actually served the library, or why none did.
    get librarySource() { return libFrom || (window.supabase ? 'already loaded' : 'not loaded'); },
    get mode() { return status; },
    // 'setup' still means the connection works — one table is absent, the rest are syncing.
    isLive() { return status === 'live' || status === 'behind' || status === 'setup'; },
    get missingTables() { return Array.from(missing); },
    configured: live,

    // The link to send to the other three phones. Valid only while the keys are valid.
    connectLink(page) {
      if (!live) return null;
      const dir = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
      return dir + (page || 'login.html') + '#k=' + b64.enc(CFG.url + '|' + CFG.anonKey);
    },
    connect: askKeys,
    purgeTests: purgeTests,

    // The resolved keys, so the counter app's own record sync can connect itself instead
    // of asking a shop assistant to type a project URL and a 200-character key.
    config() { return { url: CFG.url, anonKey: CFG.anonKey, from: CFG.from }; },

    // Has this table been read from the server yet? The honest answer to "is it empty?",
    // which is only answerable after a read.
    hasFetched(t) { return fetched.has(t); },

    // Has the boot read finished? True even if some tables failed — the point is that
    // waiting is over and the app must now act on what it has.
    settled() { return firstSweepDone || status === 'local'; },

    list(t) { return readLocal(t); },

    put(t, row) {
      row = Object.assign({}, row);
      if (row.id == null) row.id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      row.updated_at = new Date().toISOString();
      row.__pending = !client;
      mergeRow(t, row);
      emit(t, 'self');
      if (bc) try { bc.postMessage({ table: t }); } catch (e) {}
      if (client) {
        client.from(t).upsert(stripLocal(row)).then(({ error }) => {
          if (error && !noteFailure(t, error)) { queuePush(t, stripLocal(row)); setStatus('behind', 'retrying'); }
        });
      } else if (live) {
        queuePush(t, stripLocal(row));
      }
      return row;
    },

    putMany(t, rows) {
      if (!rows || !rows.length) return [];
      const stamp = new Date().toISOString();
      const existing = readLocal(t);
      const byId = new Map(existing.map((r, i) => [String(r.id), i]));
      const out = [];
      rows.forEach(r => {
        const row = Object.assign({}, r);
        if (row.id == null) row.id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        row.updated_at = stamp;
        row.__pending = !client;
        const i = byId.get(String(row.id));
        if (i == null) { byId.set(String(row.id), existing.length); existing.push(row); }
        else existing[i] = Object.assign({}, existing[i], row);
        out.push(row);
      });
      writeLocal(t, existing);
      emit(t, 'self');
      if (bc) try { bc.postMessage({ table: t }); } catch (e) {}
      const payload = out.map(stripLocal);
      if (client) {
        for (let i = 0; i < payload.length; i += 500) {
          const chunk = payload.slice(i, i + 500);
          client.from(t).upsert(chunk).then(({ error }) => {
            if (error && !noteFailure(t, error)) { chunk.forEach(r => queuePush(t, r)); setStatus('behind', 'retrying'); }
          });
        }
      } else if (live) {
        payload.forEach(r => queuePush(t, r));
      }
      return out;
    },

    remove(t, id) {
      writeLocal(t, readLocal(t).filter(r => String(r.id) !== String(id)));
      emit(t, 'self');
      if (bc) try { bc.postMessage({ table: t }); } catch (e) {}
      if (client) client.from(t).delete().eq('id', id);
    },

    removeMany(t, ids) {
      if (!ids || !ids.length) return;
      const kill = new Set(ids.map(String));
      writeLocal(t, readLocal(t).filter(r => !kill.has(String(r.id))));
      emit(t, 'self');
      if (bc) try { bc.postMessage({ table: t }); } catch (e) {}
      if (client) client.from(t).delete().in('id', ids.map(String));
    },

    subscribe(t, cb) {
      (subs[t] = subs[t] || []).push(cb);
      return () => { subs[t] = (subs[t] || []).filter(f => f !== cb); };
    },

    onStatus(cb) { statusCbs.push(cb); cb(status, ''); },

    async testConnection() {
      if (!live) return { ok: false, msg: 'Not connected on this device.' };
      try {
        if (!window.supabase) await loadLibrary();
        if (!window.supabase) return { ok: false, msg: 'The database library could not load — ' + libFrom };
        // Same reason as above: a throwaway probe client must never look at the URL for
        // an OAuth code it cannot complete.
        const c = window.supabase.createClient(CFG.url, CFG.anonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'cs9_probe_noauth' }
        });
        const { error } = await c.from('requests').select('id').limit(1);
        return error ? { ok: false, msg: error.message } : { ok: true, msg: 'Connected.' };
      } catch (e) { return { ok: false, msg: String(e.message || e) }; }
    }
  };

  function stripLocal(row) { const r = Object.assign({}, row); delete r.__pending; return r; }

  // Rows queued for a table this build no longer writes to — the roster briefly used the
  // other app's "staff" table — can never land. Dropped once, on boot.
  try {
    const q = (JSON.parse(localStorage.getItem(QKEY)) || []).filter(x => TABLES.indexOf(x.table) >= 0);
    localStorage.setItem(QKEY, JSON.stringify(q));
  } catch (e) {}

  purgeTests();
  if (live) initLive(); else banner('local', 'no keys on this device');
})();
