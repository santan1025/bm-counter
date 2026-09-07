// ═══════════════════════════════════════════════════════════════════════════
// SESSION — who is signed in, and what they are allowed to open
// ═══════════════════════════════════════════════════════════════════════════
// Loaded by every screen. Three jobs: keep the signed-in person on the device, stop a
// screen opening for a role it does not belong to, and hold the staff roster.
//
// The roster moved out of this file and into the shared `staff_accounts` table. That is the whole
// point: a phone number added on one device appears on every device, and adding a person
// no longer means editing code and republishing. The list below is only a first-run seed —
// once the table has rows, the table wins.
//
// Role isolation is still enforced here, on the device, which makes it a convenience and
// not armour: someone in a browser console can reach another screen. Real isolation needs
// per-staff server identities. Honest, and stated, rather than implied.

(function () {
  const KEY = 'cs9_session';
  const TRUST = 'cs9_trusted_device';

  // The three shops that used to BE the shop list. They are now only a fallback: the real
  // list is the cm_shops table, mirrored by Sync. Adding a fourth shop is a row, not a
  // deploy. This object's identity never changes — it is mutated in place when the server
  // list arrives — because Session.shops is read synchronously all over the app.
  const SHOPS = {
    S1: 'MS Clubhouse',
    S2: 'Mulund Store',
    K1: 'Rabale Kitchens'
  };
  const KIND = { S1: 'shop', S2: 'shop', K1: 'kitchen' };
  const SHOPS_CACHE = 'cs9_shops';

  // Cached first, so a tablet that opens before the network answers still knows the shop
  // names it saw yesterday. Then the server list, which wins.
  function mergeShops(rows) {
    if (!rows || !rows.length) return false;
    let changed = false;
    rows.forEach(r => {
      if (!r || !r.id || r.active === false) return;
      if (SHOPS[r.id] !== r.name) { SHOPS[r.id] = r.name; changed = true; }
      KIND[r.id] = r.kind || 'shop';
    });
    return changed;
  }
  try { mergeShops(JSON.parse(localStorage.getItem(SHOPS_CACHE))); } catch (e) {}

  function loadShops() {
    if (!window.Sync || !Sync.list) return;
    const rows = Sync.list('cm_shops') || [];
    if (!rows.length) return;
    mergeShops(rows);
    try { localStorage.setItem(SHOPS_CACHE, JSON.stringify(rows)); } catch (e) {}
  }
  if (window.Sync && Sync.subscribe) {
    loadShops();
    Sync.subscribe('cm_shops', loadShops);
  }

  const ROLES = {
    counter:         { label: 'Counter Manager', page: 'counter-manager-v20.html', icon: '🧾' },
    chef:            { label: 'Kitchen Chef',    page: 'chef.html',                icon: '🍞' },
    kitchen_manager: { label: 'Kitchen Manager', page: 'kitchen.html',             icon: '📦' },
    owner:           { label: 'Owner',           page: 'owner.html',               icon: '📊' }
  };

  // One row per person PER ROLE. A phone number can hold more than one — Tanmay is the
  // shop 1 counter, the owner, and for now also the kitchen manager, and the PIN typed
  // decides which of the three opens. The owner and kitchen-manager rows are hidden: they
  // are never listed on a login screen, because staff who know an owner login exists will
  // eventually try PINs against the profit figures.
  const SEED = [
    { phone: '8767569788', name: 'Tanmay Salve',   role: 'counter',         shop: 'S1' },
    { phone: '8767569788', name: 'Tanmay Salve',   role: 'owner',           shop: '*',  hidden: true },
    { phone: '8767569788', name: 'Tanmay Salve',   role: 'kitchen_manager', shop: 'K1', hidden: true, temp: true },
    { phone: '8454886933', name: 'Tanmay',         role: 'counter',         shop: 'S2' },
    { phone: '7995844027', name: 'Yashwant Singh', role: 'chef',            shop: 'K1' }
  ].map(a => Object.assign({ id: a.phone + ':' + a.role, active: true, pin_hash: null, email: null }, a));

  // PINs are stored as a hash, salted with the account id, so a glance at the device's
  // storage does not hand over everyone's PIN. This is obfuscation, not cryptography: a
  // 4-digit PIN has ten thousand possibilities and anyone determined can walk them. It
  // buys exactly one thing — a PIN is not readable by accident — and the real protection
  // arrives when each person has a server-side identity.
  function hash(salt, pin) {
    const s = 'bm:' + salt + ':' + pin;
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < s.length; i++) {
      h1 = ((h1 ^ s.charCodeAt(i)) * 16777619) >>> 0;
      h2 = ((h2 + s.charCodeAt(i) * (i + 7)) * 2654435761) >>> 0;
    }
    return h1.toString(36) + '-' + h2.toString(36);
  }

  // ── roster ────────────────────────────────────────────────────────────────
  // Sync.list reads the local mirror of the shared table, so this works with no signal and
  // is instant. The seed is written up ONLY when the server has actually been read and is
  // genuinely empty — a brand new project.
  //
  // The distinction matters more than it looks. The mirror is also empty for the first few
  // seconds of every cold start, before the first read returns. Treating that as "the table
  // is empty" meant any phone opening the login screen early pushed these pin-less seed
  // rows over the real accounts, wiping every staff member's PIN on every device and asking
  // them all to set a new one — which the next phone to open would then wipe again.
  let seeded = false;
  function roster() {
    if (!window.Sync) return SEED.slice();
    let rows = Sync.list('staff_accounts').filter(r => r && r.phone && ROLES[r.role] && r.active !== false);
    if (rows.length) return rows;
    const readYet = !!(Sync.hasFetched && Sync.hasFetched('staff_accounts'));
    if (readYet && !seeded) { seeded = true; try { Sync.putMany('staff_accounts', SEED); } catch (e) {} }
    return SEED.slice();
  }

  // True while the roster shown is the built-in fallback AND a better answer is still
  // coming. A screen that offers to CREATE a PIN needs to know the difference.
  //
  // This asks "has the boot read finished?", never "did staff_accounts read successfully?".
  // Those differ in the cases that matter: a table that was never created, or a permissions
  // rule that blocks the read, means that one table never succeeds — and gating the login on
  // it would leave every member of staff staring at "checking your account" with the sign-in
  // button disabled, permanently, with the till unopenable. Waiting must always end.
  function rosterProvisional() {
    if (!window.Sync) return false;
    const rows = Sync.list('staff_accounts').filter(r => r && r.phone && ROLES[r.role] && r.active !== false);
    if (rows.length) return false;
    if (Sync.hasFetched && Sync.hasFetched('staff_accounts')) return false;
    if (!Sync.configured || Sync.mode === 'local') return false;
    return !(Sync.settled && Sync.settled());
  }

  // Why the roster is the fallback, once waiting is over — so a screen can say something
  // a person can act on instead of a spinner that never stops.
  function rosterFault() {
    if (!window.Sync || rosterProvisional()) return null;
    const rows = Sync.list('staff_accounts').filter(r => r && r.phone && ROLES[r.role] && r.active !== false);
    if (rows.length) return null;
    if (Sync.hasFetched && Sync.hasFetched('staff_accounts')) return null;
    if ((Sync.missingTables || []).indexOf('staff_accounts') >= 0)
      return 'The staff table has not been created yet — run app-tables.sql in Supabase → SQL Editor. Until then each phone keeps its own PINs.';
    if (Sync.mode === 'local') return null;
    return 'The staff list could not be read from the database, so this phone is using its own copy. PINs set here stay on this phone.';
  }

  function get() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }

  // Only the counter is tied to a device. A counter manager signing in on another shop's
  // phone would file their bills in the wrong shop's books — the one mistake that cannot
  // be corrected afterwards. Chef, kitchen manager and owner work from whatever phone is
  // in their hand.
  const SHOP_BOUND = ['counter'];

  function deviceShop() {
    try {
      const loc = JSON.parse(localStorage.getItem('cs9_loc'));
      if (loc && loc.id) return loc.id;
    } catch (e) {}
    return null;
  }

  function setDeviceShop(id) {
    if (!id || id === '*' || !SHOPS[id]) return;
    let loc = {};
    try { loc = JSON.parse(localStorage.getItem('cs9_loc')) || {}; } catch (e) {}
    loc.id = id; loc.name = SHOPS[id]; loc.kitchen = SHOPS.K1;
    try { localStorage.setItem('cs9_loc', JSON.stringify(loc)); } catch (e) {}
  }

  const trusted = () => !!localStorage.getItem(TRUST);

  window.Session = {
    roles: ROLES,
    shops: SHOPS,
    shopKind: id => KIND[id] || 'shop',
    // Selling shops only. The kitchen makes stock and never rings up a customer, so it
    // must not land in a shop total or a shop switcher — the owner asked for it kept
    // separate, and adding it to takings would be a lie.
    sellingShops: () => Object.keys(SHOPS).filter(id => (KIND[id] || 'shop') === 'shop'),
    reloadShops: loadShops,

    // Owner-only. A shop is added in the app, and the row syncs to every device.
    addShop(id, name, kind) {
      const s = get();
      if (!s || (s.role !== 'owner' && s.role !== 'tester')) return { ok: false, why: 'Only the owner can add a shop.' };
      id = String(id || '').trim().toUpperCase();
      name = String(name || '').trim();
      if (!/^[A-Z][A-Z0-9]{0,5}$/.test(id)) return { ok: false, why: 'Shop code must be short letters and numbers, like S3.' };
      if (!name) return { ok: false, why: 'Give the shop a name.' };
      if (!window.Sync) return { ok: false, why: 'No connection to save the shop.' };
      // Without the table the row lands in localStorage only and reaches no other device,
      // while the screen says it was added — a false success is worse than a refusal.
      if ((Sync.missingTables || []).indexOf('cm_shops') >= 0) {
        return { ok: false, why: 'Run app-tables.sql in Supabase first — the shop list table is not in the database yet, so a new shop could not reach the other phones.' };
      }
      Sync.put('cm_shops', {
        id: id, name: name, kind: kind || 'shop', active: true,
        updated_at: new Date().toISOString()
      });
      loadShops();
      return { ok: true, id: id, name: name };
    },
    shopName: id => (id === '*' ? 'All shops' : (SHOPS[id] || id || '')),
    list: roster,
    rosterProvisional: rosterProvisional,
    rosterFault: rosterFault,
    current: get,
    deviceShop: deviceShop,
    setDeviceShop: setDeviceShop,

    // The long-press on the logo. Persists, because the owner should not have to rediscover
    // it every morning, and it only ever reveals — it never grants.
    trusted: trusted,
    trust(on) {
      if (on === false) localStorage.removeItem(TRUST);
      else localStorage.setItem(TRUST, new Date().toISOString());
      return trusted();
    },

    // ── Google identity ───────────────────────────────────────────────────
    // A Google account is matched to a staff row by email, and nothing else. Anyone on
    // earth can present a valid Google account, so a successful Google sign-in proves only
    // "this really is that email" — it grants nothing until an email is on a staff row.
    accountForEmail(email) {
      const e = String(email || '').trim().toLowerCase();
      if (!e) return null;
      const rows = roster().filter(a => String(a.email || '').toLowerCase() === e);
      if (!rows.length) return null;
      // A person with more than one role gets the most privileged, because Google carries
      // no PIN to choose with. Owner outranks kitchen manager outranks the rest.
      const rank = { owner: 3, kitchen_manager: 2, counter: 1, chef: 1 };
      return rows.slice().sort((a, b) => (rank[b.role] || 0) - (rank[a.role] || 0))[0];
    },

    // Has anybody claimed an email yet? Answers the first-run question: an app where no
    // row has an email can have no Google user, and would otherwise be unopenable by
    // Google forever.
    anyEmailSet() {
      return roster().some(a => !!a.email);
    },

    emailAccounts() {
      return roster().filter(a => !a.hidden || trusted());
    },

    // Attaching an email is the actual grant of access, so it is owner work. One email may
    // hold several roles on one person, but two different people must never share one —
    // the email is the identity.
    attachEmail(id, email) {
      const e = String(email || '').trim().toLowerCase();
      if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, why: 'That does not look like an email address.' };
      const all = roster();
      const acct = all.find(a => a.id === id);
      if (!acct) return { ok: false, why: 'That account no longer exists.' };
      const clash = all.find(a => a.id !== id && a.phone !== acct.phone && String(a.email || '').toLowerCase() === e && e);
      if (clash) return { ok: false, why: e + ' is already on ' + clash.name + '\u2019s account. One email belongs to one person.' };
      const row = Object.assign({}, acct, { email: e || null });
      if (window.Sync) Sync.put('staff_accounts', row);
      return { ok: true, account: row };
    },

    // Signing in as a matched Google account. Same session shape and same punch-in as a
    // PIN sign-in, so every screen downstream is unaware of which door was used.
    signInWithEmail(email) {
      const acct = this.accountForEmail(email);
      if (!acct) {
        return { ok: false, unknown: true, why: String(email || '') + ' is not on the staff list. '
          + 'An owner adds it on the Backup & Google screen \u2014 signing in with Google cannot grant its own access.' };
      }
      const dev = deviceShop();
      const sess = {
        phone: acct.phone, name: acct.name, role: acct.role,
        shop: acct.shop === '*' ? (dev || 'S1') : acct.shop,
        allShops: acct.shop === '*',
        via: 'google', email: String(email).toLowerCase(),
        at: new Date().toISOString()
      };
      localStorage.setItem(KEY, JSON.stringify(sess));
      this.punchIn(sess);
      return { ok: true, session: sess };
    },

    // Every account on a number. Hidden ones only where the device has been trusted.
    accountsFor(phone) {
      const p = String(phone || '').trim();
      return roster().filter(a => a.phone === p && (!a.hidden || trusted()));
    },

    // What the login screen shows under the number field. Deliberately does not count
    // hidden accounts: "3 roles" on a shared phone is itself a disclosure.
    describe(phone) {
      const list = this.accountsFor(phone);
      if (!list.length) return null;
      const setup = list.filter(a => !a.pin_hash);
      return {
        name: list[0].name,
        roles: list.map(a => a.role),
        needsSetup: setup,
        multi: list.length > 1
      };
    },

    // First sign-in sets the PIN. Two rules: four digits, and no two accounts on one number
    // may share a PIN — the PIN is what selects the role, so a collision would make the
    // choice ambiguous and silently open the wrong screen.
    setPin(id, pin) {
      pin = String(pin || '').trim();
      if (!/^\d{4}$/.test(pin)) return { ok: false, why: 'PIN must be exactly 4 digits.' };
      if (/^(\d)\1{3}$/.test(pin) || pin === '1234' || pin === '0000') return { ok: false, why: 'Too easy to guess. Choose another 4 digits.' };
      const all = roster();
      const acct = all.find(a => a.id === id);
      if (!acct) return { ok: false, why: 'That account no longer exists.' };
      const clash = all.find(a => a.phone === acct.phone && a.id !== id && a.pin_hash === hash(a.id, pin));
      if (clash) return { ok: false, why: 'That PIN is already used by your ' + (ROLES[clash.role] || {}).label + ' login on this number. Choose another.' };
      const row = Object.assign({}, acct, { pin_hash: hash(id, pin) });
      if (window.Sync) Sync.put('staff_accounts', row);
      return { ok: true, account: row };
    },

    // The PIN decides the role. No role picker, no second step: type the number, type the
    // PIN, land on the right screen.
    signIn(phone, pin, opts) {
      const p = String(phone || '').trim();
      const accts = roster().filter(a => a.phone === p);
      if (!accts.length) return { ok: false, why: 'No staff with this number.' };

      const match = accts.find(a => a.pin_hash && a.pin_hash === hash(a.id, pin));
      if (!match) {
        const unset = accts.filter(a => !a.pin_hash && (!a.hidden || trusted()));
        if (unset.length) return { ok: false, setup: unset, why: 'First sign-in on this number — create a PIN.' };
        return { ok: false, why: 'Wrong PIN.' };
      }

      const dev = deviceShop();
      if (!(opts && opts.ignoreShop) && SHOP_BOUND.indexOf(match.role) >= 0 && match.shop !== '*' && dev
          && this.staffShops(match).indexOf(dev) < 0) {
        return { ok: false, why: match.name + ' works at ' + this.shopName(match.shop) + ', and this phone belongs to '
          + this.shopName(dev) + '. Ask the owner to lend them to this shop.' };
      }

      // The owner decides which shop a tablet belongs to, and does it by signing in on
      // that tablet once. It used to bind itself to the first counter person who signed
      // in, which is how two phones ended up on different shops and silently stopped
      // sharing anything. A counter person no longer changes what shop a phone is.
      if (!dev && (match.role === 'owner' || match.role === 'tester') && match.shop !== '*') setDeviceShop(match.shop);

      const sess = {
        phone: match.phone, name: match.name, role: match.role,
        shop: match.shop === '*' ? (dev || 'S1') : match.shop,
        allShops: match.shop === '*',
        at: new Date().toISOString()
      };
      localStorage.setItem(KEY, JSON.stringify(sess));
      this.punchIn(sess);
      return { ok: true, session: sess };
    },

    // Signing in punches you in — one action, not two. An existing OPEN punch for today is
    // reused so a reload does not create a second shift.
    //
    // The id carries a timestamp because rows merge by id: a stable per-day id meant an
    // afternoon sign-in overwrote the morning shift's in_at while the morning's out_at
    // survived, leaving hours negative. Salary comes off these rows, so a re-login must
    // never rewrite a closed shift.
    punchIn(sess) {
      if (!window.Sync) return;
      const day = new Date().toISOString().slice(0, 10);
      const open = Sync.list('punches').find(p => p.staff_phone === sess.phone && p.date === day && !p.out_at);
      if (open) return open;
      return Sync.put('punches', {
        id: 'punch-' + sess.shop + '-' + day + '-' + sess.phone + '-' + Date.now(),
        staff_phone: sess.phone, staff_name: sess.name, role: sess.role,
        shop_id: sess.shop, date: day, in_at: new Date().toISOString(),
        out_at: null, in_verified: false
      });
    },

    punchOut() {
      const sess = get();
      if (!sess || !window.Sync) return null;
      const day = new Date().toISOString().slice(0, 10);
      const open = Sync.list('punches').find(p => p.staff_phone === sess.phone && p.date === day && !p.out_at);
      if (!open) return null;
      return Sync.put('punches', Object.assign({}, open, { out_at: new Date().toISOString(), out_auto: false }));
    },

    // Clamped at zero: one malformed row must never show the owner negative hours.
    hoursToday() {
      const sess = get();
      if (!sess || !window.Sync) return 0;
      const day = new Date().toISOString().slice(0, 10);
      return Sync.list('punches')
        .filter(p => p.staff_phone === sess.phone && p.date === day && p.in_at)
        .reduce((a, p) => a + Math.max(0, (new Date(p.out_at || Date.now()) - new Date(p.in_at)) / 3600000), 0);
    },

    // Signing out has to end BOTH sessions. Clearing only the local key left the Google
    // session alive, and login.html — which auto-resumes a live Google session by design —
    // signed the same person straight back in within a second. It looked like the button
    // did nothing. The flag is belt and braces: even if Google's sign-out is slow or fails
    // offline, login.html sees it and shows the sign-in screen instead of resuming.
    // Everyone on the roster INCLUDING attendance-only people, who have no phone and so
    // are filtered out of the login list. The owner's screen manages this list; the login
    // screen must never show it.
    allStaff() {
      if (!window.Sync) return SEED.slice();
      return (Sync.list('staff_accounts') || []).filter(r => r && r.name);
    },

    // ── roster administration ───────────────────────────────────────────
    // Owner only, and the owner's screen is the only place it is offered. Whoever can add
    // a person can hand out a login, so this is not a manager's button.
    canAdmin() {
      const s = get();
      return !!s && (s.role === 'owner' || s.role === 'tester');
    },

    addStaff(o) {
      if (!this.canAdmin()) return { ok: false, why: 'Only the owner can add staff.' };
      if (!window.Sync) return { ok: false, why: 'No connection to save this person.' };
      if ((Sync.missingTables || []).indexOf('staff_accounts') >= 0)
        return { ok: false, why: 'Run app-tables.sql in Supabase first — the staff table is not in the database yet.' };
      const name = String(o.name || '').trim();
      const phone = String(o.phone || '').replace(/\D/g, '');
      const role = o.role || 'counter';
      const shop = o.shop || deviceShop() || 'S1';
      if (!name) return { ok: false, why: 'Give the person a name.' };
      if (phone && phone.length !== 10) return { ok: false, why: 'A phone number must be 10 digits, or left blank.' };
      if (!ROLES[role]) return { ok: false, why: 'Unknown role.' };
      // No phone means no login — they exist so their hours are counted, nothing more.
      const id = phone ? phone + ':' + role : 'att:' + Date.now().toString(36);
      if (phone && this.allStaff().some(a => a.phone === phone && a.role === role && a.active !== false))
        return { ok: false, why: name + ' already has a ' + ROLES[role].label + ' account on that number.' };
      const row = {
        id: id, phone: phone, name: name, role: role, shop: shop,
        pin_hash: o.pin ? hash(id, String(o.pin)) : null,
        no_login: !phone, hidden: false, temp: false, active: true,
        cover_shops: null, shift_in: o.shiftIn || null, shift_out: o.shiftOut || null,
        email: null, updated_at: new Date().toISOString()
      };
      Sync.put('staff_accounts', row);
      return { ok: true, staff: row };
    },

    // A transfer MOVES someone. Their past punches and bills keep the shop they were rung
    // up in — history is not rewritten by a transfer, or last month's takings would move
    // between shops every time somebody changed branch.
    transferStaff(id, shop) {
      if (!this.canAdmin()) return { ok: false, why: 'Only the owner can move staff.' };
      const a = this.allStaff().find(x => String(x.id) === String(id));
      if (!a) return { ok: false, why: 'That person is not on the roster.' };
      if (!SHOPS[shop]) return { ok: false, why: 'Unknown shop.' };
      Sync.put('staff_accounts', Object.assign({}, a, { shop: shop, updated_at: new Date().toISOString() }));
      return { ok: true, name: a.name, shop: SHOPS[shop] };
    },

    // Lending is additive: the home shop stays, so the dashboard still counts them as its
    // staff, and they can sign in at the shop they are covering.
    lendStaff(id, shop, on) {
      if (!this.canAdmin()) return { ok: false, why: 'Only the owner can lend staff.' };
      const a = this.allStaff().find(x => String(x.id) === String(id));
      if (!a) return { ok: false, why: 'That person is not on the roster.' };
      if (!SHOPS[shop]) return { ok: false, why: 'Unknown shop.' };
      const list = String(a.cover_shops || '').split(',').map(s => s.trim()).filter(Boolean);
      const i = list.indexOf(shop);
      if (on === false || (on == null && i >= 0)) { if (i >= 0) list.splice(i, 1); }
      else if (i < 0) list.push(shop);
      Sync.put('staff_accounts', Object.assign({}, a, {
        cover_shops: list.join(',') || null, updated_at: new Date().toISOString()
      }));
      return { ok: true, name: a.name, covers: list };
    },

    // Deactivate, never delete: every punch and every bill names a person, and a deleted
    // row turns all of that history into an unresolvable id.
    setStaffActive(id, active) {
      if (!this.canAdmin()) return { ok: false, why: 'Only the owner can do this.' };
      const a = this.allStaff().find(x => String(x.id) === String(id));
      if (!a) return { ok: false, why: 'That person is not on the roster.' };
      Sync.put('staff_accounts', Object.assign({}, a, {
        active: !!active, updated_at: new Date().toISOString()
      }));
      return { ok: true, name: a.name, active: !!active };
    },

    // Which shops a person may sign in at — home plus anywhere they are lent to.
    staffShops(a) {
      if (!a) return [];
      if (a.shop === '*') return Object.keys(SHOPS);
      return [a.shop].concat(String(a.cover_shops || '').split(',').map(s => s.trim()).filter(Boolean))
        .filter((v, i, arr) => v && arr.indexOf(v) === i);
    },

    mergeReceipt: () => mergeReceipt(),

    signOut(alsoPunchOut) {
      if (alsoPunchOut) this.punchOut();
      localStorage.removeItem(KEY);
      try { sessionStorage.setItem('cs9_signed_out', '1'); } catch (e) {}
      const done = () => { location.href = 'login.html'; };
      if (window.GAuth && GAuth.signOut) {
        let sent = false;
        const once = () => { if (!sent) { sent = true; done(); } };
        setTimeout(once, 2500);            // never strand the user on a hung network
        GAuth.signOut().then(once, once);
      } else done();
    },

    require(allowed) {
      const sess = get();
      if (!sess) { location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop())); return null; }
      if (allowed && allowed.indexOf(sess.role) < 0) {
        location.replace('login.html?denied=' + encodeURIComponent(sess.role));
        return null;
      }
      return sess;
    },

    landingFor(role) {
      return (ROLES[role] || ROLES.counter).page;
    },

    // Docked, not floating. A position:fixed chip has no space reserved for it, so on one
    // screen or another it lands over a heading or — worse — over a button, and this one
    // signs you out. It renders only into an explicit anchor each screen places where its
    // own layout has room, and does nothing at all if there is no anchor.
    chip() {      const sess = get();
      const mount = document.querySelector('[data-session-chip]');
      if (!sess || !mount || mount.dataset.filled) return;
      mount.dataset.filled = '1';
      const dark = mount.dataset.sessionChip === 'dark';
      const el = document.createElement('button');
      el.type = 'button';
      el.id = 'sess-chip';
      el.style.cssText = 'display:inline-flex;align-items:center;gap:7px;border-radius:20px;cursor:pointer;'
        + 'font:600 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
        + 'padding:6px 11px;text-align:left;white-space:nowrap;'
        + (dark ? 'background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);color:#fff;'
                : 'background:#fdf6ec;border:1px solid #e0d4c4;color:#4a2c0a;');
      const paint = () => {
        el.innerHTML = '<span style="font-size:12.5px">' + ((ROLES[sess.role] || {}).icon || '') + '</span>'
          + '<span><b>' + sess.name.split(' ')[0] + '</b> · ' + this.hoursToday().toFixed(1) + ' h</span>';
      };
      paint();
      setInterval(paint, 60000);
      el.title = sess.name + ' — ' + ((ROLES[sess.role] || {}).label || sess.role);
      el.onclick = () => {
        if (confirm(sess.name + ' — ' + this.hoursToday().toFixed(1) + ' hours today.'
          + '\n\nOK = punch out and sign out\nCancel = stay signed in')) this.signOut(true);
      };
      mount.appendChild(el);
    }
  };

  // ── the staff merge ──────────────────────────────────────────────
  // The counter app kept its OWN staff list and attendance in localStorage: no shop, no
  // sync, PINs in plain text. The people staff punch against lived on one tablet, while
  // the roster that grants logins lived elsewhere. Assign, transfer, lend and deactivate
  // all need one list, so this moves the tablet's list and its punches onto the synced
  // roster — once per device, automatically, no button.
  //
  // Punch ids are DERIVED from the record rather than generated, so running twice upserts
  // the same rows instead of inventing duplicate hours. These hours get paid; duplicates
  // would be paid twice. It also means a corrected run REPAIRS what an earlier one wrote,
  // which is why the key is versioned:
  //   v1 attached punches to nobody and left months-old shifts open;
  //   v2 fixed that in the code but wrote a shop_assumed field to a column that does not
  //      exist, so Postgres rejected every row, sync swallowed the error, and the receipt
  //      reported a repair that never landed — worse than the fault it claimed to fix.
  // v3 writes only columns the table actually has. Nothing invents a column again: the
  // shop assumption is recorded in the receipt and shown on the owner's screen, which is
  // where a person can act on it, and needs no column at all.
  const MERGED = 'cs9_staff_merged_v3';
  const ROLE_MAP = {
    counter: 'counter', 'counter manager': 'counter', cashier: 'counter', sales: 'counter',
    chef: 'chef', baker: 'chef', kitchen: 'kitchen_manager', 'kitchen manager': 'kitchen_manager',
    manager: 'counter', owner: 'owner', helper: 'counter'
  };

  function mergeLocalStaff() {
    try {
      if (localStorage.getItem(MERGED)) return;
      if ((window.Sync && Sync.missingTables || []).indexOf('staff_accounts') >= 0) return;

      const local = JSON.parse(localStorage.getItem('cs9_stafflist') || '[]');
      const att = JSON.parse(localStorage.getItem('cs9_attend') || '[]');
      if (!local.length && !att.length) { localStorage.setItem(MERGED, 'nothing-to-do'); return; }

      const shop = deviceShop() || 'S1';
      const server = Sync.list('staff_accounts') || [];
      const byKey = {};
      const byName = {};
      server.forEach(a => {
        if (a.phone) byKey[a.phone + ':' + a.role] = a;
        if (a.name) byName[String(a.name).trim().toLowerCase()] = a;
      });

      const idFor = {};
      const notes = [];
      let made = 0, matched = 0;

      local.forEach(st => {
        const name = String(st.name || '').trim();
        if (!name) return;
        const phone = String(st.phone || '').replace(/\D/g, '');
        const role = ROLE_MAP[String(st.role || 'counter').toLowerCase()] || 'counter';
        const key = phone + ':' + role;
        if (phone && byKey[key]) {
          // Already on the roster. Their shop is left exactly as it is — the roster is the
          // authority, and switching a tablet on must not reassign anybody.
          idFor[String(st.id)] = byKey[key].id;
          matched++;
          return;
        }
        // No phone means no login, only hours — which is the point of these records. The
        // owner adds a number later and it becomes an ordinary account.
        const rid = phone ? key : 'att:' + shop + ':' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        idFor[String(st.id)] = rid;
        Sync.put('staff_accounts', {
          id: rid, phone: phone, name: name, role: role, shop: shop,
          pin_hash: st.pin ? hash(rid, String(st.pin)) : null,
          no_login: !phone, hidden: false, temp: false, active: true,
          cover_shops: null, shift_in: st.shIn || null, shift_out: st.shOut || null,
          email: null, updated_at: new Date().toISOString()
        });
        made++;
      });

      const today = new Date().toISOString().slice(0, 10);
      let punches = 0, closed = 0, fixedNeg = 0, unknown = 0;
      const wrote = [];

      att.forEach(a => {
        if (!a || !a.date || !a.inTime) return;
        const nm = String(a.name || '').trim();

        // Identity, three ways. The tablet's staff list is the first choice but is often
        // empty — it was empty on the shop's own tablet, which is how the first run
        // attached ten punches to nobody. A name match against the roster is the fallback,
        // and a punch that still resolves to no phone is reported rather than filed away.
        let phone = null;
        const viaList = idFor[String(a.staffId)] || '';
        const head = viaList.split(':')[0];
        if (/^\d{10}$/.test(head)) phone = head;
        if (!phone && nm && byName[nm.toLowerCase()] && byName[nm.toLowerCase()].phone)
          phone = byName[nm.toLowerCase()].phone;
        if (!phone) { unknown++; notes.push('no roster match for "' + (nm || 'unnamed') + '" on ' + a.date); }

        const iso = (d, v) => {
          const t = new Date(d + 'T' + String(v).slice(0, 5) + ':00');
          return isNaN(t) ? null : t;
        };
        const inT = iso(a.date, a.inTime);
        if (!inT) return;
        let outT = a.outTime ? iso(a.date, a.outTime) : null;
        let assumed = false;

        // A shift that ends before it starts crossed midnight. Left alone it renders as
        // negative hours — one such row was already written.
        if (outT && outT <= inT) {
          outT = new Date(outT.getTime() + 86400000);
          if (outT <= inT) { outT = null; }
          fixedNeg++;
        }

        // An open punch from a past day is not a live shift: left open it accrues hours
        // forever, and one merged row was already showing 837 of them. It is closed at the
        // person's shift end where known, otherwise eight hours, and marked assumed so the
        // owner's screen labels it "assumed, not a real punch" rather than passing it off
        // as a real one.
        if (!outT && a.date < today) {
          const acct = phone ? server.find(s => s.phone === phone) : null;
          const end = (acct && acct.shift_out) || (a.shOut || null);
          const guess = end ? iso(a.date, end) : null;
          outT = (guess && guess > inT) ? guess : new Date(inT.getTime() + 8 * 3600000);
          assumed = true;
          closed++;
        }

        Sync.put('punches', {
          id: 'merged-' + shop + '-' + a.date + '-' + String(a.staffId) + '-' + String(a.inTime).replace(/\D/g, ''),
          staff_phone: phone, staff_name: nm, role: a.role || 'counter',
          shop_id: shop, date: a.date,
          in_at: inT.toISOString(), out_at: outT ? outT.toISOString() : null,
          in_verified: a.method === 'biometric',
          assumed: assumed,
          updated_at: new Date().toISOString()
        });
        punches++;
        wrote.push({ id: 'merged-' + shop + '-' + a.date + '-' + String(a.staffId) + '-' + String(a.inTime).replace(/\D/g, ''), phone: phone });
      });

      const receipt = {
        at: new Date().toISOString(), shop: shop, made: made, matched: matched,
        punches: punches, closed: closed, negativeFixed: fixedNeg, unmatched: unknown,
        shopAssumed: punches,
        notes: notes.slice(0, 20)
      };
      localStorage.setItem(MERGED, JSON.stringify(receipt));
      // The tablet's own copies are LEFT IN PLACE: the punch buttons keep working from
      // them, nothing on screen changes today, and if this got anything wrong the originals
      // are still there to read.
      console.log('[staff merge]', receipt);

      // Then CHECK it landed. A rejected write is invisible here — the row upserts into
      // localStorage, the error is swallowed, and the server keeps the old values until the
      // next read quietly overwrites the good ones. That is exactly how v2 reported a
      // repair it had not made. If the values did not stick, the flag is cleared so the
      // next load tries again, and it says so instead of claiming success.
      setTimeout(() => {
        try {
          const now = Sync.list('punches') || [];
          const bad = wrote.filter(w => {
            const r = now.find(p => String(p.id) === w.id);
            return !r || (w.phone && r.staff_phone !== w.phone);
          });
          if (!bad.length) return;
          console.warn('[staff merge] ' + bad.length + ' of ' + wrote.length
            + ' punches did not persist — the server rejected them. Retrying on next load.', bad.slice(0, 3));
          localStorage.removeItem(MERGED);
        } catch (e) {}
      }, 6000);
    } catch (e) {
      console.warn('[staff merge] skipped', e);
    }
  }

  // What the merge did, for the owner's screen to show. Nobody was asked to press a
  // button, so nobody was told what happened — and it moved hours that get paid.
  function mergeReceipt() {
    try {
      const r = JSON.parse(localStorage.getItem(MERGED) || 'null');
      return (r && typeof r === 'object') ? r : null;
    } catch (e) { return null; }
  }

  // Waits for the first server read: deciding who is "new" against a roster that has not
  // loaded yet would recreate everybody.
  function armMerge() {
    let tries = 0;
    const t = setInterval(() => {
      if (localStorage.getItem(MERGED) || ++tries > 40) { clearInterval(t); return; }
      if (window.Sync && Sync.settled && Sync.settled()) { clearInterval(t); mergeLocalStaff(); }
    }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armMerge);
  else armMerge();

  // ── the unbound-tablet bar ───────────────────────────────────────────────
  // A tablet with no shop still takes bills: a till must never refuse a sale, the same
  // reason writes queue offline instead of failing. But the day's rows would carry no
  // shop, so it says so continuously until the owner sets it, rather than discovering it
  // at the day close.
  function unboundBar() {
    const sess = get();
    if (!sess || sess.role === 'owner' || sess.role === 'tester') return;
    if (deviceShop() || sess.allShops) return;
    if (document.getElementById('cs9-unbound')) return;
    const b = document.createElement('div');
    b.id = 'cs9-unbound';
    b.setAttribute('data-no-i18n', '');
    b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;background:#8a5a12;color:#fff;'
      + 'font:600 12.5px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:9px 14px;'
      + 'display:flex;align-items:center;gap:9px;box-shadow:0 3px 14px rgba(0,0,0,.25)';
    b.innerHTML = '<span style="font-size:15px">⚠</span><span style="flex:1">This tablet has no shop yet — '
      + 'keep working, but ask the owner to set it. Today’s figures cannot be counted into a shop until then.</span>';
    document.body.appendChild(b);
    // A fixed bar reserves no space, so it sat on top of the page header — which is where
    // the settings gear lives, the one control that fixes the very thing the bar reports.
    // The page is pushed down by exactly the bar's height instead. (sync.js's bar docks at
    // the bottom for the same reason; two bars at the bottom would stack and hide it.)
    const pad = () => {
      const h = b.offsetHeight || 40;
      const base = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
      if (!document.body.dataset.cs9Pad) {
        document.body.dataset.cs9Pad = String(base);
        document.body.style.paddingTop = (base + h) + 'px';
      }
    };
    pad();
    window.addEventListener('resize', () => {
      if (!document.body.dataset.cs9Pad) return;
      const base = parseFloat(document.body.dataset.cs9Pad) || 0;
      document.body.style.paddingTop = (base + (b.offsetHeight || 40)) + 'px';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', unboundBar);
  else unboundBar();

  // The old roster lived in this key, with PINs in plain text and a tester account. It is
  // superseded by the shared table and is removed rather than left to confuse a later read.
  try {
    const old = localStorage.getItem('cs9_staff_list');
    if (old) localStorage.setItem('cs9_staff_list_archived', old);
    localStorage.removeItem('cs9_staff_list');
  } catch (e) {}
})();
