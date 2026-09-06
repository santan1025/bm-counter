/* Shared Settings sheet — one gear button, same sheet, on every screen.
   Each page declares what belongs in it:

     window.CM_SETTINGS = {
       title: 'Counter Manager',
       groups: [ { label: 'Shop', items: [ {icon,label,hint,onClick} | {toggle:...} ] } ]
     };

   Built-ins always appended: appearance (dark), diagnostics, other screens, sign out.
   The button docks into [data-settings-btn] anchors if a page provides them; otherwise
   it injects into every .pg-hdr / .top-r so no screen is left without one. */
(function () {
  const SYNC_CFG = 'cs9_sync';
  const cfg = () => { try { return JSON.parse(localStorage.getItem(SYNC_CFG)) || {}; } catch (e) { return {}; } };
  const DARKS = ['cs9_dark', 'cm_dark', 'dark'];
  const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  const SCREENS = [
    { file: 'index.html', label: 'Home / launcher', icon: '🏠' },
    { file: 'counter-manager-v20.html', label: 'Counter Manager', icon: '🎂' },
    { file: 'kitchen.html', label: 'Kitchen Board', icon: '🍞' },
    { file: 'chef.html', label: 'What to make', icon: '👨‍🍳' },
    { file: 'owner.html', label: 'Owner Dashboard', icon: '📊' }
  ];

  function css() {
    if (document.getElementById('cm-set-css')) return;
    const s = document.createElement('style');
    s.id = 'cm-set-css';
    s.textContent = `
#cm-set-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:none;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px)}
#cm-set-bg.open{display:flex}
#cm-set-sheet{background:#fff;color:#1c1410;width:100%;max-width:520px;max-height:88vh;overflow-y:auto;border-radius:20px 20px 0 0;padding:8px 16px 28px;box-shadow:0 -8px 40px rgba(0,0,0,.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-overflow-scrolling:touch}
body.dark #cm-set-sheet{background:#1b1613;color:#f2e9e2}
#cm-set-grab{width:44px;height:4px;border-radius:4px;background:rgba(0,0,0,.18);margin:6px auto 12px}
body.dark #cm-set-grab{background:rgba(255,255,255,.22)}
#cm-set-head{display:flex;align-items:center;gap:10px;margin-bottom:4px}
#cm-set-head h2{margin:0;font-size:19px;font-weight:900;letter-spacing:-.2px}
#cm-set-sub{font-size:11.5px;opacity:.62;margin-bottom:14px;line-height:1.5}
.cm-set-x{margin-left:auto;background:none;border:none;font-size:20px;line-height:1;cursor:pointer;color:inherit;opacity:.5;padding:6px}
.cm-set-grp{font-size:10.5px;font-weight:900;letter-spacing:.9px;text-transform:uppercase;opacity:.5;margin:18px 0 8px}
.cm-set-row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:none;border:1px solid rgba(0,0,0,.09);border-radius:13px;padding:13px 14px;margin-bottom:7px;cursor:pointer;color:inherit;font:inherit;min-height:52px}
body.dark .cm-set-row{border-color:rgba(255,255,255,.12)}
.cm-set-row:active{transform:scale(.99)}
.cm-set-ic{font-size:18px;width:24px;text-align:center;flex:0 0 24px}
.cm-set-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cm-set-lb{display:block;font-size:14.5px;font-weight:700}
.cm-set-hn{display:block;font-size:11px;opacity:.6;line-height:1.45}
.cm-set-val{font-size:12px;font-weight:800;opacity:.75;white-space:nowrap}
.cm-set-row.danger{border-color:rgba(190,50,40,.45);color:#c0392b}
body.dark .cm-set-row.danger{color:#ff8a7a}
.cm-set-in{display:flex;gap:8px;margin-bottom:7px}
.cm-set-in input{flex:1;min-width:0;padding:12px;border-radius:11px;border:1px solid rgba(0,0,0,.15);background:transparent;color:inherit;font:inherit;font-size:14px}
body.dark .cm-set-in input{border-color:rgba(255,255,255,.16)}
.cm-set-in button{padding:0 16px;border-radius:11px;border:none;background:#8a5a2b;color:#fff;font-weight:800;cursor:pointer}
.cm-gear{background:none;border:none;font-size:19px;line-height:1;cursor:pointer;padding:6px;color:inherit;opacity:.85}
.cm-gear:active{opacity:.5}`;
    document.head.appendChild(s);
  }

  function darkOn() { return document.body.classList.contains('dark') || DARKS.some(k => localStorage.getItem(k)); }
  function toggleDarkSafe() {
    if (typeof window.toggleDark === 'function') { window.toggleDark(); return; }
    const on = document.body.classList.toggle('dark');
    DARKS.forEach(k => { if (localStorage.getItem(k) !== null || k === 'cs9_dark') on ? localStorage.setItem(k, '1') : localStorage.removeItem(k); });
  }

  function row(it) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cm-set-row' + (it.danger ? ' danger' : '');
    b.innerHTML = '<span class="cm-set-ic">' + (it.icon || '•') + '</span>'
      + '<span class="cm-set-tx"><span class="cm-set-lb"></span>'
      + (it.hint ? '<span class="cm-set-hn"></span>' : '') + '</span>'
      + (it.value ? '<span class="cm-set-val"></span>' : '');
    b.querySelector('.cm-set-lb').textContent = it.label;
    if (it.hint) b.querySelector('.cm-set-hn').textContent = it.hint;
    if (it.value) b.querySelector('.cm-set-val').textContent = it.value;
    b.onclick = () => { try { it.onClick && it.onClick(); } catch (e) { console.error(e); } };
    return b;
  }

  function build() {
    const spec = window.CM_SETTINGS || {};
    const c = cfg();
    const sheet = document.getElementById('cm-set-sheet');
    sheet.innerHTML = '<div id="cm-set-grab"></div>'
      + '<div id="cm-set-head"><h2>Settings</h2><button class="cm-set-x" type="button">✕</button></div>'
      + '<div id="cm-set-sub"></div>';
    sheet.querySelector('.cm-set-x').onclick = close;
    sheet.querySelector('#cm-set-sub').textContent =
      (spec.title || 'Cake Shop Counter') + ' · ' + (c.shopName || c.shop || 'shop not set')
      + (c.device ? ' · ' + c.device : '');

    const groups = (spec.groups || []).slice();

    groups.push({
      label: 'Appearance',
      items: [{
        icon: darkOn() ? '☀️' : '🌙',
        label: darkOn() ? 'Switch to light mode' : 'Switch to dark mode',
        hint: 'Easier on the eyes for evening shifts',
        onClick: () => { toggleDarkSafe(); build(); }
      }]
    });

    const others = SCREENS.filter(s => s.file.toLowerCase() !== here);
    if (others.length) groups.push({
      label: 'Go to another screen',
      items: others.map(s => ({ icon: s.icon, label: s.label, onClick: () => { location.href = s.file; } }))
    });

    groups.push({
      label: 'Support & diagnostics',
      items: [
        { icon: '🩺', label: 'Run a health check', hint: 'What this phone has, what the cloud has', onClick: () => { location.href = 'check.html'; } },
        { icon: '☁️', label: 'Google & Drive backup', hint: 'Sign in and back up to Drive', onClick: () => { location.href = 'backup.html'; } },
        ...(typeof window.openIssue === 'function'
          ? [{ icon: '🐞', label: 'Report a problem', hint: 'Goes to the owner with this device’s details', onClick: () => { close(); window.openIssue(); } }]
          : [])
      ]
    });

    const sess = window.Session && Session.current && Session.current();
    groups.push({
      label: 'Account',
      items: [
        ...(sess ? [{ icon: '👤', label: 'Signed in as ' + sess.name, hint: (sess.role || '') + ' · tap to sign out', danger: false, onClick: () => { if (confirm('Sign out ' + sess.name + '?\n\nOK also punches out of the shift.')) Session.signOut(true); } }] : []),
        ...(sess ? [] : [{ icon: '🔑', label: 'Sign in', onClick: () => { location.href = 'login.html'; } }])
      ]
    });

    groups.forEach(g => {
      const items = (g.items || []).filter(Boolean);
      if (!items.length) return;
      if (g.label) {
        const h = document.createElement('div');
        h.className = 'cm-set-grp';
        h.textContent = g.label;
        sheet.appendChild(h);
      }
      items.forEach(it => sheet.appendChild(it.node ? it.node() : row(it)));
    });
  }

  function open() { css(); shell(); build(); document.getElementById('cm-set-bg').classList.add('open'); }
  function close() { const b = document.getElementById('cm-set-bg'); if (b) b.classList.remove('open'); }

  function shell() {
    if (document.getElementById('cm-set-bg')) return;
    const bg = document.createElement('div');
    bg.id = 'cm-set-bg';
    bg.innerHTML = '<div id="cm-set-sheet"></div>';
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    document.body.appendChild(bg);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  function gear() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cm-gear';
    b.setAttribute('aria-label', 'Settings');
    b.title = 'Settings';
    b.textContent = '⚙';
    b.onclick = open;
    return b;
  }

  function mount() {
    css(); shell();
    const anchors = document.querySelectorAll('[data-settings-btn]');
    const targets = anchors.length ? anchors : document.querySelectorAll('.pg-hdr, .top-r, .top');
    targets.forEach(t => {
      if (t.querySelector(':scope > .cm-gear')) return;
      t.appendChild(gear());
    });
  }

  window.CMSettings = { open, close, mount, refresh: build };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
