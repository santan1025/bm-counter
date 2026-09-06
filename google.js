// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE — sign-in, and backups into Drive
// ═══════════════════════════════════════════════════════════════════════════
// Two jobs that share one consent screen, which is the only reason they live in one file:
// signing in with Google and writing a backup into Google Drive both need the same
// authorisation, and asking for it twice would mean two permission prompts for one action.
//
// WHAT THIS IS FOR. Supabase is already the backup — the shop's data lives in a hosted
// database, not on the phones, and a lost phone loses nothing. A Drive backup is a
// different thing: a copy YOU own, in an account nobody can revoke, readable without this
// app. It matters the day the subscription lapses, the database is deleted by mistake, or
// somebody wants last March's takings in a spreadsheet.
//
// ⚠ THE TOKEN LIMIT, stated plainly because it shapes the whole design. A browser holds a
// Google Drive authorisation for about an hour and cannot renew it silently. So backups run
// while a manager is signed in and looking at the screen — a button, and once per session.
// There is no 2am automatic backup and this file does not pretend to offer one; that needs a
// server, which this app does not have.
//
// SCOPE. drive.file, which is the narrowest scope that can write: this app can only see and
// touch files it created itself. It cannot read the rest of anyone's Drive, and asking for
// less would mean not being able to write at all.

(function () {
  const SCOPE  = 'https://www.googleapis.com/auth/drive.file';
  const TOKKEY = 'cs9_gtoken';          // sessionStorage — dies with the tab, by design
  const FOLDER = 'BM Ventures Backups';
  const API    = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

  let client = null;
  let ready  = null;

  // The Supabase library is fetched by sync.js from one of three CDNs, so it may not be
  // there the instant this file runs. Wait for it rather than failing on a race — but end
  // the wait, because a spinner that never stops is worse than an error that explains.
  function lib(ms) {
    const end = Date.now() + (ms || 12000);
    return new Promise(res => {
      (function poll() {
        if (window.supabase) return res(true);
        if (Date.now() > end) return res(false);
        setTimeout(poll, 150);
      })();
    });
  }

  // A separate client from sync.js's. That one moves shop records and has no business
  // holding a person's identity; this one only does auth.
  async function auth() {
    if (client) return client;
    if (!ready) ready = lib().then(ok => {
      if (!ok || !window.SUPABASE_CONFIG) return null;
      client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: { storageKey: 'cs9_gauth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      return client;
    });
    return ready;
  }

  // The Drive authorisation arrives once, in the redirect back from Google, and is never
  // sent again on later page loads. So it is caught the moment it appears and kept for the
  // life of the tab. sessionStorage and not localStorage: a token on disk outlives the
  // person holding the phone.
  function stash(sess) {
    if (!sess || !sess.provider_token) return;
    try {
      sessionStorage.setItem(TOKKEY, JSON.stringify({
        token: sess.provider_token,
        until: Date.now() + 55 * 60 * 1000
      }));
    } catch (e) {}
  }

  function token() {
    try {
      const t = JSON.parse(sessionStorage.getItem(TOKKEY));
      if (t && t.token && t.until > Date.now()) return t.token;
    } catch (e) {}
    return null;
  }

  async function need() {
    const t = token();
    if (!t) throw new Error('Google access has expired. Sign in with Google again to back up — a browser can only hold Drive permission for about an hour.');
    return t;
  }

  // ── identity ──────────────────────────────────────────────────────────────
  window.GAuth = {
    scope: SCOPE,

    // Called once by every page that offers Google. Picks up a redirect coming back from
    // Google, or restores an existing signed-in identity.
    async boot() {
      const c = await auth();
      if (!c) return { ok: false, why: 'The Google sign-in library could not load on this phone.' };
      try {
        const { data, error } = await c.auth.getSession();
        if (error) return { ok: false, why: error.message };
        if (data && data.session) { stash(data.session); return { ok: true, user: this.user(data.session) }; }
        return { ok: true, user: null };
      } catch (e) {
        return { ok: false, why: e.message || String(e) };
      }
    },

    user(sess) {
      const u = sess && sess.user;
      if (!u) return null;
      const m = u.user_metadata || {};
      return {
        email: (u.email || '').toLowerCase(),
        name:  m.full_name || m.name || (u.email || '').split('@')[0],
        photo: m.avatar_url || m.picture || null,
        id:    u.id
      };
    },

    async current() {
      const c = await auth();
      if (!c) return null;
      const { data } = await c.auth.getSession();
      if (data && data.session) stash(data.session);
      return this.user(data && data.session);
    },

    // Leaves the page. Google comes back to whatever URL asked, so the person lands where
    // they started rather than on a home screen wondering what happened.
    async signIn(withDrive) {
      const c = await auth();
      if (!c) return { ok: false, why: 'The Google sign-in library could not load on this phone.' };
      const opts = { redirectTo: location.href.replace(/#.*$/, '') };
      if (withDrive !== false) {
        opts.scopes = SCOPE;
        // Without this Google returns a fresh session but no Drive authorisation for
        // somebody who has consented before — and the backup button then fails for the
        // one person who has used it most.
        opts.queryParams = { prompt: 'consent', include_granted_scopes: 'true' };
      }
      const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: opts });
      return error ? { ok: false, why: error.message } : { ok: true };
    },

    async signOut() {
      const c = await auth();
      try { sessionStorage.removeItem(TOKKEY); } catch (e) {}
      if (c) await c.auth.signOut();
    },

    hasDrive: () => !!token()
  };

  // ── what a backup contains ────────────────────────────────────────────────
  // Every shared table, plus every cs9_ setting on this device — staff names, UPI details,
  // counter safe, prices. Those settings are exactly what was lost once before, and a
  // backup of records without them restores a shop that cannot open.
  //
  // Deliberately excluded: the sign-in session, the write queue and the Google token. They
  // are this phone's private state, not the shop's, and restoring them onto another device
  // would sign a stranger in.
  const SKIP = ['cs9_session', 'cs9_sync_queue', 'cs9_gtoken', 'cs9_gauth', 'cs9_trusted_device'];

  function settings() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf('cs9_') !== 0) continue;
      if (SKIP.indexOf(k) >= 0 || k.indexOf('cs9_sync_') === 0) continue;
      out[k] = localStorage.getItem(k);
    }
    return out;
  }

  function snapshot() {
    const tables = {};
    if (window.Sync) (Sync.tables || []).forEach(t => { tables[t] = Sync.list(t); });
    const counts = {};
    Object.keys(tables).forEach(t => { counts[t] = tables[t].length; });
    return {
      format: 'bm-ventures-backup',
      version: 1,
      taken_at: new Date().toISOString(),
      taken_by: (window.Session && Session.current() && Session.current().name) || null,
      device_shop: (window.Session && Session.deviceShop()) || null,
      counts: counts,
      tables: tables,
      settings: settings()
    };
  }

  const csv = rows => {
    if (!rows || !rows.length) return '';
    const cols = Object.keys(rows.reduce((a, r) => Object.assign(a, r), {}));
    const cell = v => {
      if (v == null) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [cols.join(',')].concat(rows.map(r => cols.map(c => cell(r[c])).join(','))).join('\n');
  };

  // ── Drive ─────────────────────────────────────────────────────────────────
  async function drive(path, opts) {
    const t = await need();
    const r = await fetch(API + path, Object.assign({}, opts, {
      headers: Object.assign({ Authorization: 'Bearer ' + t }, (opts || {}).headers || {})
    }));
    if (!r.ok) throw new Error('Google Drive refused: ' + r.status + ' ' + (await r.text()).slice(0, 160));
    return r.status === 204 ? null : r.json();
  }

  async function put(meta, body, mime) {
    const t = await need();
    const b = '--bm' + Date.now() + Math.random().toString(36).slice(2, 8);
    const payload = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + JSON.stringify(meta) + '\r\n--' + b + '\r\nContent-Type: ' + mime + '\r\n\r\n'
      + body + '\r\n--' + b + '--';
    const r = await fetch(UPLOAD + '?uploadType=multipart&fields=id,name,webViewLink,size', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'multipart/related; boundary=' + b },
      body: payload
    });
    if (!r.ok) throw new Error('Google Drive refused the upload: ' + r.status + ' ' + (await r.text()).slice(0, 160));
    return r.json();
  }

  // drive.file scope means this listing only ever sees folders this app made, so a folder
  // of the same name elsewhere in the owner's Drive is invisible and cannot be written to.
  async function folder(name, parent) {
    const q = "mimeType='application/vnd.google-apps.folder' and trashed=false and name='"
      + name.replace(/'/g, "\\'") + "'" + (parent ? " and '" + parent + "' in parents" : '');
    const found = await drive('/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)&pageSize=5');
    if (found.files && found.files.length) return found.files[0].id;
    const meta = { name: name, mimeType: 'application/vnd.google-apps.folder' };
    if (parent) meta.parents = [parent];
    const made = await drive('/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) });
    return made.id;
  }

  // The tables worth reading as a spreadsheet. The rest are in the snapshot; turning all
  // eleven into sheets means eleven uploads on a shop's mobile connection for tables nobody
  // opens by hand.
  const SHEETS = ['cm_sales', 'requests', 'dispatches', 'expenses', 'damage', 'punches'];

  window.DriveBackup = {
    snapshot: snapshot,
    folderName: FOLDER,

    // Both halves of the answer to "what is the backup for": a snapshot that restores, and
    // sheets that read. onStep reports progress, because on a shop connection this takes
    // long enough that a silent button looks broken.
    async run(onStep) {
      const step = s => { try { onStep && onStep(s); } catch (e) {} };
      const snap = snapshot();
      const day  = snap.taken_at.slice(0, 10);
      const time = snap.taken_at.slice(11, 16).replace(':', '');

      step('Checking the backup folder…');
      const root = await folder(FOLDER);

      step('Writing the restore file…');
      const json = await put(
        { name: 'bm-backup-' + day + '-' + time + '.json', parents: [root], description: 'Full restorable snapshot — open in the app’s Backup screen to restore.' },
        JSON.stringify(snap, null, 1), 'application/json');

      step('Writing readable sheets…');
      const sub = await folder('Sheets ' + day + ' ' + time, root);
      const sheets = [];
      for (const t of SHEETS) {
        const rows = (snap.tables || {})[t] || [];
        if (!rows.length) continue;
        const made = await put(
          { name: t, parents: [sub], mimeType: 'application/vnd.google-apps.spreadsheet' },
          csv(rows), 'text/csv');
        sheets.push({ table: t, rows: rows.length, id: made.id, link: made.webViewLink });
      }

      const total = Object.keys(snap.counts).reduce((a, k) => a + snap.counts[k], 0);
      return {
        ok: true, at: snap.taken_at, rows: total,
        settings: Object.keys(snap.settings).length,
        file: json, folder: root, sheets: sheets
      };
    },

    async list() {
      const root = await folder(FOLDER);
      const q = "'" + root + "' in parents and trashed=false and mimeType='application/json'";
      const r = await drive('/files?q=' + encodeURIComponent(q)
        + '&fields=files(id,name,size,createdTime,webViewLink)&orderBy=createdTime desc&pageSize=30');
      return (r.files || []).map(f => ({
        id: f.id, name: f.name, size: Number(f.size || 0),
        at: f.createdTime, link: f.webViewLink
      }));
    },

    async read(id) {
      const t = await need();
      const r = await fetch(API + '/files/' + id + '?alt=media', { headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) throw new Error('That backup file could not be read: ' + r.status);
      const snap = await r.json();
      if (!snap || snap.format !== 'bm-ventures-backup') throw new Error('That file is not a backup made by this app.');
      return snap;
    },

    // Restore is the dangerous direction, so it is deliberately awkward: nothing happens
    // without an explicit list of what to bring back, and records merge rather than
    // replace — Sync keeps whichever row was updated later, so restoring an old backup
    // cannot silently undo today's takings.
    async restore(snap, what) {
      if (!snap || snap.format !== 'bm-ventures-backup') throw new Error('Not a backup file.');
      const done = { tables: {}, settings: 0 };

      if (what && what.records && window.Sync) {
        for (const t of Object.keys(snap.tables || {})) {
          if ((Sync.tables || []).indexOf(t) < 0) continue;
          const rows = snap.tables[t] || [];
          if (!rows.length) continue;
          Sync.putMany(t, rows);
          done.tables[t] = rows.length;
        }
      }

      // Settings restore only fills gaps by default. Overwriting is a separate, louder
      // choice: pushing a two-week-old counter safe over today's would be exactly the kind
      // of quiet data loss this whole screen exists to undo.
      if (what && what.settings) {
        for (const k of Object.keys(snap.settings || {})) {
          if (SKIP.indexOf(k) >= 0) continue;
          const here = localStorage.getItem(k);
          if (here != null && !what.overwrite) continue;
          try { localStorage.setItem(k, snap.settings[k]); done.settings++; } catch (e) {}
        }
      }
      return done;
    }
  };
})();
