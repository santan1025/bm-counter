/* The ⚙ sheet — one button, one sheet, every screen.
   ───────────────────────────────────────────────────────────────────────────
   Deliberately short. The owner cut it to six things after seeing a longer
   draft: language, shop name, icons, data & backup, health check, sign out.
   Products, staff, inventory, snapshots, cloud sync and clear-data are NOT
   here — they live in the More tab, where a manager already knows to look.
   Counter staff open this sheet all day; the items that can break a shop stay
   out of their reach.

   Role gate: shop code and Drive backup show only to manager and owner. A
   counter person changing the shop code silently detaches the phone from the
   shop — which is exactly the fault we spent a week chasing.

   Pages may add their own rows via window.CM_SETTINGS = { extra: [ … ] }. */
(function () {
  const SYNC_CFG = 'cs9_sync';
  const cfg = () => { try { return JSON.parse(localStorage.getItem(SYNC_CFG)) || {}; } catch (e) { return {}; } };
  const save = v => { try { localStorage.setItem(SYNC_CFG, JSON.stringify(v)); } catch (e) {} };
  const sess = () => (window.Session && Session.current && Session.current()) || null;
  const isBoss = () => { const s = sess(); return !s || s.role === 'owner' || s.role === 'manager' || s.role === 'tester'; };
  const note = m => { if (typeof window.toast === 'function') window.toast(m); };

  function css() {
    if (document.getElementById('cm-set-css')) return;
    // The Devanagari face is a <link>, not an @import inside the injected style:
    // an @import is only honoured at the very top of a stylesheet, and the
    // language buttons must not fall back to tofu on an Android tablet.
    if (!document.getElementById('cm-dev-font')) {
      const l = document.createElement('link');
      l.id = 'cm-dev-font';
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&display=swap';
      document.head.appendChild(l);
    }
    const s = document.createElement('style');
    s.id = 'cm-set-css';
    s.textContent = `
#cm-set-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:none;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px)}
#cm-set-bg.open{display:flex}
/* The whole sheet scrolls. On a 5-inch phone the language row would otherwise
   push Sign out off the bottom with no way to reach it. */
#cm-set-sheet{background:#fff;color:#1c1410;width:100%;max-width:520px;max-height:88vh;overflow-y:auto;-webkit-overflow-scrolling:touch;border-radius:20px 20px 0 0;padding:8px 16px 30px;box-shadow:0 -8px 40px rgba(0,0,0,.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
body.dark #cm-set-sheet{background:#1b1613;color:#f2e9e2}
#cm-set-grab{width:44px;height:4px;border-radius:4px;background:rgba(0,0,0,.18);margin:6px auto 12px}
body.dark #cm-set-grab{background:rgba(255,255,255,.22)}
#cm-set-head{display:flex;align-items:center;gap:10px}
#cm-set-head h2{margin:0;font-size:19px;font-weight:900;letter-spacing:-.2px}
#cm-set-sub{font-size:11.5px;opacity:.62;margin:4px 0 16px;line-height:1.5}
.cm-set-x{margin-left:auto;background:none;border:none;font-size:20px;line-height:1;cursor:pointer;color:inherit;opacity:.5;padding:6px;min-width:44px;min-height:44px}
.cm-set-grp{font-size:10.5px;font-weight:900;letter-spacing:.9px;text-transform:uppercase;opacity:.5;margin:18px 0 8px}
.cm-set-grp:first-of-type{margin-top:0}
.cm-set-list{display:flex;flex-direction:column;gap:7px}
.cm-set-row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:none;border:1px solid rgba(0,0,0,.09);border-radius:13px;padding:13px 14px;cursor:pointer;color:inherit;font:inherit;min-height:52px}
body.dark .cm-set-row{border-color:rgba(255,255,255,.12)}
.cm-set-ic{font-size:18px;width:24px;text-align:center;flex:0 0 24px}
/* Empty collapses, so the repaint path and the row-build path agree on layout
   instead of one removing the span and the other merely blanking it. */
.cm-set-ic:empty{display:none}
.cm-set-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cm-set-lb{display:block;font-size:14.5px;font-weight:700}
.cm-set-hn{display:block;font-size:11px;opacity:.6;line-height:1.45}
.cm-set-val{font-size:12px;font-weight:800;opacity:.75;white-space:nowrap}
.cm-set-row.danger{border-color:rgba(190,50,40,.45);color:#c0392b}
body.dark .cm-set-row.danger{color:#ff8a7a}
.cm-lang{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.cm-lang button{padding:14px 6px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:none;color:inherit;font:inherit;font-size:15px;font-weight:700;cursor:pointer;min-height:52px;font-family:'Noto Sans Devanagari',-apple-system,sans-serif}
body.dark .cm-lang button{border-color:rgba(255,255,255,.14)}
.cm-lang button.on{background:#8a5a2b;border-color:#8a5a2b;color:#fff;font-weight:800}
.cm-hint{font-size:11px;opacity:.6;margin:8px 0 0;line-height:1.45}
.cm-set-in{display:flex;gap:8px}
.cm-set-in input{flex:1;min-width:0;padding:12px;border-radius:11px;border:1px solid rgba(0,0,0,.15);background:transparent;color:inherit;font:inherit;font-size:14px;min-height:48px}
body.dark .cm-set-in input{border-color:rgba(255,255,255,.16)}
.cm-set-in button{padding:0 18px;border-radius:11px;border:none;background:#8a5a2b;color:#fff;font-weight:800;cursor:pointer;min-height:48px}
.cm-sw{width:44px;height:26px;border-radius:14px;background:rgba(0,0,0,.18);position:relative;flex:0 0 44px;transition:background .15s}
.cm-sw.on{background:#8a5a2b}
.cm-sw i{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:10px;background:#fff;transition:left .15s}
.cm-sw.on i{left:21px}
.cm-gear{background:none;border:none;font-size:19px;line-height:1;cursor:pointer;padding:6px;color:inherit;opacity:.85;min-width:44px;min-height:44px}
.cm-gear:active{opacity:.5}`;
    document.head.appendChild(s);
  }

  function row(it) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cm-set-row' + (it.danger ? ' danger' : '');
    b.innerHTML = '<span class="cm-set-ic"></span><span class="cm-set-tx">'
      + '<span class="cm-set-lb"></span><span class="cm-set-hn"></span></span>'
      + '<span class="cm-set-val"></span>';
    // With icons off the span is removed, not just emptied: it is flex:0 0 24px,
    // and an empty one leaves a 24px hole indenting every row.
    const icEl = b.querySelector('.cm-set-ic');
    if (it.icon && (!window.I18N || I18N.iconsOn())) icEl.textContent = it.icon;
    else icEl.remove();
    b.querySelector('.cm-set-lb').textContent = it.label;
    const hn = b.querySelector('.cm-set-hn');
    it.hint ? hn.textContent = it.hint : hn.remove();
    const vl = b.querySelector('.cm-set-val');
    it.value ? vl.textContent = it.value : vl.remove();
    b.onclick = () => { try { it.onClick && it.onClick(); } catch (e) { console.error(e); } };
    return b;
  }

  // One broken row must never take the sheet down with it. Before, an exception
  // inside a row builder aborted build() after innerHTML had been cleared, which
  // left an empty sheet with no Sign out in it — the exact fault we were fixing.
  function group(label, nodes) {
    const f = document.createDocumentFragment();
    if (label) {
      const h = document.createElement('div');
      h.className = 'cm-set-grp';
      h.textContent = label;
      f.appendChild(h);
    }
    const l = document.createElement('div');
    l.className = 'cm-set-list';
    nodes.forEach(n => {
      try { if (n) l.appendChild(typeof n === 'function' ? n() : n); } catch (e) { console.warn('settings row', e); }
    });
    f.appendChild(l);
    return f;
  }

  function langBlock() {
    if (!window.I18N) return null;
    const f = document.createDocumentFragment();
    const g = document.createElement('div');
    g.className = 'cm-lang';
    Object.keys(I18N.langs).forEach(code => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = I18N.langs[code];
      if (I18N.get() === code) b.className = 'on';
      b.onclick = () => { I18N.set(code); build(); };
      g.appendChild(b);
    });
    f.appendChild(g);
    const h = document.createElement('div');
    h.className = 'cm-hint';
    h.textContent = sess()
      ? 'Saved to your name — follows you to any phone. Reports stay in English.'
      : 'Sign in first if you want this to follow you to other phones.';
    f.appendChild(h);
    return f;
  }

  function shopNameBlock() {
    const w = document.createElement('div');
    w.className = 'cm-set-in';
    const i = document.createElement('input');
    i.type = 'text';
    i.placeholder = 'Shop name on reports';
    i.value = cfg().shopName || '';
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Save';
    b.onclick = () => {
      const v = cfg();
      v.shopName = i.value.trim();
      save(v);
      note(v.shopName ? '✅ Shop name set — ' + v.shopName : 'Shop name cleared');
      build();
    };
    w.appendChild(i);
    w.appendChild(b);
    return w;
  }

  function iconRow() {
    if (!window.I18N) return null;
    const on = I18N.iconsOn();
    const b = row({
      icon: '🙂', label: 'Show icons',
      hint: 'Off gives plain text. The bottom tabs keep their icons.'
    });
    const sw = document.createElement('span');
    sw.className = 'cm-sw' + (on ? ' on' : '');
    sw.innerHTML = '<i></i>';
    b.appendChild(sw);
    b.onclick = () => { I18N.setIcons(!I18N.iconsOn()); build(); };
    return b;
  }

  function build() {
    const sheet = document.getElementById('cm-set-sheet');
    const s = sess(), c = cfg(), boss = isBoss();
    // Sign out is built FIRST and kept aside, so it is appended even if a row
    // above it fails. Nobody gets trapped in a session again.
    let signRow;
    try {
      signRow = s
        ? row({
            icon: '↩', label: 'Sign out', danger: true,
            onClick: () => {
              if (confirm('Sign out ' + s.name + '?\n\nOK also punches you out of the shift.')) Session.signOut(true);
            }
          })
        : row({ icon: '🔑', label: 'Sign in', onClick: () => { location.href = 'login.html'; } });
    } catch (e) { console.warn(e); }

    sheet.innerHTML = '<div id="cm-set-grab"></div>'
      + '<div id="cm-set-head"><h2>Settings</h2><button class="cm-set-x" type="button" aria-label="Close">✕</button></div>'
      + '<div id="cm-set-sub"></div>';
    sheet.querySelector('.cm-set-x').onclick = close;
    sheet.querySelector('#cm-set-sub').textContent =
      [(window.CM_SETTINGS && CM_SETTINGS.title) || 'Cake Shop Counter',
       c.shopName || 'shop name not set',
       s ? s.name : 'not signed in'].join(' · ');

    const lb = langBlock();
    if (lb) sheet.appendChild(group('Language', [lb]));

    sheet.appendChild(group('Shop', [
      shopNameBlock(),
      boss && row({
        icon: '🏪', label: 'Shop code',
        hint: 'Every phone in this shop must show the same code',
        value: c.shop || 'not set',
        onClick: () => { close(); if (window.go && window.mTab) { go('more'); mTab('sync'); } else location.href = 'check.html'; }
      })
    ]));

    sheet.appendChild(group('This phone', [
      iconRow(),
      row({
        icon: '💾', label: 'Data & backup', hint: 'Export, import, Excel downloads',
        onClick: () => { close(); if (window.go && window.mTab) { go('more'); mTab('data'); } else location.href = 'backup.html'; }
      }),
      row({
        icon: '🩺', label: 'Run a health check', hint: 'What this phone has vs the cloud',
        onClick: () => { location.href = 'check.html'; }
      }),
      boss && row({
        icon: '☁️', label: 'Google & Drive backup', hint: 'Sign in and back up to Drive',
        onClick: () => { location.href = 'backup.html'; }
      })
    ]));

    const extra = (window.CM_SETTINGS && CM_SETTINGS.extra) || [];
    if (extra.length) sheet.appendChild(group(CM_SETTINGS.extraLabel || 'This screen', extra.map(row)));

    sheet.appendChild(group('Account', [
      typeof window.openIssue === 'function' && row({
        icon: '🐞', label: 'Report a problem', hint: 'Goes to the owner with this device’s details',
        onClick: () => { close(); window.openIssue(); }
      }),
      signRow
    ]));

    if (window.I18N) I18N.repaint();
  }

  function shell() {
    if (document.getElementById('cm-set-bg')) return;
    const bg = document.createElement('div');
    bg.id = 'cm-set-bg';
    bg.innerHTML = '<div id="cm-set-sheet"></div>';
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    document.body.appendChild(bg);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  function open() { css(); shell(); build(); document.getElementById('cm-set-bg').classList.add('open'); }
  function close() { const b = document.getElementById('cm-set-bg'); if (b) b.classList.remove('open'); }

  function gear() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cm-gear';
    b.setAttribute('aria-label', 'Settings');
    b.setAttribute('data-no-i18n', '');
    b.title = 'Settings';
    b.textContent = '⚙';
    b.onclick = open;
    return b;
  }

  function mount() {
    css(); shell();
    const anchors = document.querySelectorAll('[data-settings-btn]');
    const targets = anchors.length ? anchors : document.querySelectorAll('.pg-hdr, .top-r, .top');
    targets.forEach(t => { if (!t.querySelector(':scope > .cm-gear')) t.appendChild(gear()); });
  }

  window.CMSettings = { open, close, mount, refresh: build };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
