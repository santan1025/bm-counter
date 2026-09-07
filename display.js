// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER DISPLAY — the link between the selling phone and the spare phone
// ═══════════════════════════════════════════════════════════════════════════
// Phone A rings up the sale. Phone B sits on the counter facing the customer and shows
// what is happening. The QR itself never travels: a UPI string is text, so B builds its
// own code from the amount. What crosses the wire is a few hundred bytes.
//
// Two transports, both optional:
//   Supabase realtime broadcast — phone to phone, nothing stored, no table, no SQL.
//   BroadcastChannel — two tabs on ONE device, so this can be tested on one phone.
//
// Nothing here is allowed to break a sale. Every send is wrapped: if the network is gone,
// A carries on exactly as it does today and B is simply stale. That is the whole design
// rule — B is a bonus, never a dependency.

(function () {
  const LIB_SOURCES = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
    'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js',
    'https://esm.sh/@supabase/supabase-js@2/dist/umd/supabase.js'
  ];
  let libPromise = null;

  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      let i = 0;
      const tick = () => {
        if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
        if (i >= LIB_SOURCES.length) return reject(new Error('supabase-js unreachable'));
        const s = document.createElement('script');
        s.src = LIB_SOURCES[i++];
        s.async = true;
        s.onload = () => (window.supabase && window.supabase.createClient) ? resolve(window.supabase) : tick();
        s.onerror = tick;
        document.head.appendChild(s);
      };
      tick();
    });
    return libPromise;
  }

  let client = null;
  function getClient() {
    if (client) return client;
    const cfg = window.SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) return null;
    // Its own client with auth switched off: this channel moves a bill amount and must
    // never touch anyone's session or read an OAuth code out of the URL.
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      realtime: { params: { eventsPerSecond: 8 } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'cs9_display_noauth' }
    });
    return client;
  }

  const chanName = shop => 'cd_' + String(shop || 'S1').toUpperCase();

  function localChannel(shop) {
    try { return new BroadcastChannel(chanName(shop)); } catch (e) { return null; }
  }

  // ── Phone A ───────────────────────────────────────────────────────────────
  // Keeps the last state it sent. A display that is opened halfway through a sale asks
  // ("hello") and gets the current bill, instead of sitting on an idle screen until the
  // next tap.
  function host(shop) {
    const bc = localChannel(shop);
    let ch = null, live = false, last = { state: 'idle' };

    const raw = payload => {
      try { if (bc) bc.postMessage(payload); } catch (e) {}
      try { if (ch && live) ch.send({ type: 'broadcast', event: 'state', payload: payload }); } catch (e) {}
    };

    loadLib().then(() => {
      const c = getClient();
      if (!c) return;
      ch = c.channel(chanName(shop), { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'hello' }, () => raw(last));
      ch.subscribe(status => { live = (status === 'SUBSCRIBED'); if (live) raw(last); });
    }).catch(() => {});

    if (bc) bc.onmessage = e => { if (e.data && e.data.state === '__hello') raw(last); };

    return {
      send(payload) { last = payload || { state: 'idle' }; raw(last); },
      get live() { return live; },
      channel: chanName(shop)
    };
  }

  // ── Phone B ───────────────────────────────────────────────────────────────
  // onState gets every payload. onLink gets true/false when the realtime connection comes
  // and goes, so the board can fall back to showing the amount as text.
  function watch(shop, onState, onLink) {
    const bc = localChannel(shop);
    let ch = null;

    if (bc) {
      bc.onmessage = e => { if (e.data && e.data.state && e.data.state !== '__hello') onState(e.data); };
      try { bc.postMessage({ state: '__hello' }); } catch (e) {}
    }

    loadLib().then(() => {
      const c = getClient();
      if (!c) { onLink && onLink(false); return; }
      ch = c.channel(chanName(shop), { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'state' }, msg => { if (msg && msg.payload) onState(msg.payload); });
      ch.subscribe(status => {
        const up = (status === 'SUBSCRIBED');
        onLink && onLink(up);
        // Ask whoever is selling for the current state, so a board opened mid-sale catches up.
        if (up) { try { ch.send({ type: 'broadcast', event: 'hello', payload: {} }); } catch (e) {} }
      });
    }).catch(() => { onLink && onLink(false); });
  }

  function url(shop) {
    const base = location.href.replace(/[^/]*$/, '');
    return base + 'display.html?shop=' + encodeURIComponent(String(shop || 'S1').toUpperCase());
  }

  window.CustomerDisplay = { host, watch, url, channel: chanName };
})();
