/* Language + icon switching for the three staff screens.
   ───────────────────────────────────────────────────────────────────────────
   Scope, decided with the owner:
     • Counter, Kitchen and Chef screens get TRANSLATION. Owner and setup screens
       stay English — the owner and the accountant read those.
     • The ICON switch, by contrast, is app-wide: it was asked for as "whole app",
       so this file loads on every screen and the emoji pass runs everywhere. Only
       the dictionary half is gated by page. The two scopes are different on
       purpose; loading the file selectively would have made the switch vanish on
       four screens, which is how it read as broken.
     • Buttons, tabs and headings only — pop-ups, errors and sync messages stay
       English, because a half-translated warning is worse than an English one.
     • Excel and EOD reports are ALWAYS English: the owner and the accountant read
       those, not the counter staff.
     • Default is English for everyone. A person switches for themselves.
     • The choice follows the PERSON, not the phone — it is keyed by staff phone
       number, so a shared counter tablet shows each person their own language.

   How it works, and why this way: the screens were written in English with the
   text sitting directly in the markup. Rather than rewrite six thousand lines
   into translation keys — a week of work and a week of new bugs — this walks the
   rendered text nodes and swaps whole strings it recognises. Exact whole-string
   matches only, so an untranslated string is left in English rather than mangled.
   A node's English original is kept, so switching back is exact and repeated
   switches never compound. */
(function () {
  const LANGS = { en: 'English', hi: 'हिंदी', mr: 'मराठी' };

  // Words checked by the owner. Shop usage beat the dictionary in three places:
  // स्टॉक (not साठा), मागणी for a kitchen request, खराब for waste — the word
  // staff do not feel blamed by.
  // The ⚙ sheet is shared by every screen, so its strings live here too — and they
  // must match what settings.js actually renders, character for character. Three
  // rows read English next to Marathi ones because the dictionary said
  // 'Health check' while the sheet said 'Run a health check'.
  const D = {
    // ── the settings sheet ──────────────────────────────────────
    'Settings':            ['सेटिंग', 'सेटिंग'],
    'Language':            ['भाषा', 'भाषा'],
    'Shop':                ['दुकान', 'दुकान'],
    'This phone':          ['यह फोन', 'हा मोबाईल'],
    'Account':             ['खाता', 'खाते'],
    'Show icons':          ['आइकॉन दिखाएँ', 'आयकॉन दाखवा'],
    'Shop code':           ['दुकान कोड', 'दुकान कोड'],
    'Shop name on reports': ['रिपोर्ट में दुकान का नाम', 'रिपोर्टमध्ये दुकानाचे नाव'],
    'Data & backup':       ['डेटा और बैकअप', 'डेटा आणि बॅकअप'],
    'Run a health check':  ['जाँच करें', 'तपासणी करा'],
    'Google & Drive backup': ['Google और Drive बैकअप', 'Google आणि Drive बॅकअप'],
    'Report a problem':    ['समस्या बताएं', 'अडचण सांगा'],
    'Sign out':            ['साइन आउट', 'साइन आउट'],
    'Sign in':             ['साइन इन', 'साइन इन'],
    'Save':                ['सेव करें', 'सेव्ह करा'],
    'not set':             ['नहीं रखा', 'सेट केलेले नाही'],
    // ── bottom tabs ─────────────────────────────────────────────
    'Today':               ['आज', 'आज'],
    'Sale':                ['बिक्री', 'विक्री'],
    'Quick Add':           ['तेज़ जोड़ें', 'झटपट भरा'],
    'Stock':               ['स्टॉक', 'स्टॉक'],
    'More':                ['और', 'अधिक'],
    // ── screen titles ───────────────────────────────────────────
    'Counter Manager':     ['काउंटर मैनेजर', 'काउंटर मॅनेजर'],
    'New Sale':            ['नई बिक्री', 'नवीन विक्री'],
    'Orders':              ['ऑर्डर', 'ऑर्डर'],
    'Tax Invoice':         ['टैक्स बिल', 'टॅक्स बिल'],
    'Expenses':            ['खर्च', 'खर्च'],
    'Kitchen Board':       ['किचन बोर्ड', 'किचन बोर्ड'],
    'What to make':        ['क्या बनाना है', 'काय बनवायचे'],
    // ── section headings ────────────────────────────────────────
    'Quick Actions':       ['तेज़ काम', 'झटपट कामे'],
    'Go to':               ['जाएँ', 'जा'],
    "Today's Stock Values": ['आज का स्टॉक मूल्य', 'आजचे स्टॉक मूल्य'],
    'Customer Details':    ['ग्राहक की जानकारी', 'ग्राहकाची माहिती'],
    'Place New Order':     ['नया ऑर्डर दें', 'नवीन ऑर्डर द्या'],
    'Recent Sales (Today)': ['आज की बिक्री', 'आजची विक्री'],
    // ── More pills ──────────────────────────────────────────────
    'Reports':             ['रिपोर्ट', 'रिपोर्ट'],
    'Damage':              ['खराब', 'खराब'],
    'Special':             ['स्पेशल', 'स्पेशल'],
    'Credit':              ['उधार', 'उधार'],
    'Staff & Attendance':  ['स्टाफ और हाज़िरी', 'स्टाफ आणि हजेरी'],
    'Products':            ['प्रोडक्ट', 'प्रॉडक्ट'],
    'Cloud Sync':          ['क्लाउड सिंक', 'क्लाउड सिंक'],
    'Data':                ['डेटा', 'डेटा'],
    'Snapshots':           ['स्नैपशॉट', 'स्नॅपशॉट'],
    'Shop Inventory':      ['दुकान का सामान', 'दुकानातील सामान'],
    'Report Problem':      ['समस्या बताएं', 'अडचण सांगा'],
    'Invoice':             ['बिल', 'बिल'],
    '+ New Sale':          ['+ नई बिक्री', '+ नवीन विक्री'],
    'End of Day Settlement': ['दिन का हिसाब', 'दिवसाचा हिशोब'],
    'All Actions':         ['सभी काम', 'सर्व कामे'],
    'Counter Safe':        ['काउंटर तिजोरी', 'काउंटर तिजोरी'],
    'Refund ↩':            ['वापसी ↩', 'परतावा ↩'],
    '+ Expense':           ['+ खर्च', '+ खर्च'],
    '→ Checkout':          ['→ हिसाब करें', '→ हिशोब करा'],
    'Go to Cart & Checkout →': ['कार्ट और हिसाब →', 'कार्ट आणि हिशोब →'],
    '✕ Close':             ['✕ बंद करें', '✕ बंद करा'],
    'Save':                ['सेव करें', 'सेव्ह करा'],
    'Cancel':              ['रद्द करें', 'रद्द करा'],
    'Delete':              ['हटाएँ', 'काढून टाका'],
    'Edit':                ['बदलें', 'बदला'],
    'Add':                 ['जोड़ें', 'जोडा'],
    'Print':               ['प्रिंट', 'प्रिंट'],
    'Share':               ['भेजें', 'पाठवा'],
    'Search':              ['खोजें', 'शोधा'],
    'Sign out':            ['साइन आउट', 'साइन आउट'],
    'Settings':            ['सेटिंग', 'सेटिंग'],
    'Language':            ['भाषा', 'भाषा'],
    'Show icons':          ['आइकॉन दिखाएँ', 'आयकॉन दाखवा'],
    'Data & backup':       ['डेटा और बैकअप', 'डेटा आणि बॅकअप'],
    'Health check':        ['जाँच करें', 'तपासणी करा'],
    'Report a problem':    ['समस्या बताएं', 'अडचण सांगा'],
    'Shop code':           ['दुकान कोड', 'दुकान कोड'],
    'Sign out':            ['साइन आउट', 'साइन आउट'],
    'Settings':            ['सेटिंग', 'सेटिंग'],
    'Language':            ['भाषा', 'भाषा'],
    'Show icons':          ['आइकॉन दिखाएँ', 'आयकॉन दाखवा'],
    'Data & backup':       ['डेटा और बैकअप', 'डेटा आणि बॅकअप'],
    'Health check':        ['जाँच करें', 'तपासणी करा'],
    'Report a problem':    ['समस्या बताएं', 'अडचण सांगा'],
    'Shop code':           ['दुकान कोड', 'दुकान कोड'],
    'Shop name':           ['दुकान का नाम', 'दुकानाचे नाव'],
    // ── labels seen on the counter all day ──────────────────────
    'Total':               ['कुल', 'एकूण'],
    'Cash':                ['नकद', 'रोख'],
    'UPI':                 ['UPI', 'UPI'],
    'Card':                ['कार्ड', 'कार्ड'],
    'Customer':            ['ग्राहक', 'ग्राहक'],
    'Qty':                 ['संख्या', 'संख्या'],
    'Rate':                ['भाव', 'दर'],
    'Price':               ['दाम', 'किंमत'],
    'Discount':            ['छूट', 'सूट'],
    'Paid':                ['चुकाया', 'दिले'],
    'Balance':             ['बाकी', 'बाकी'],
    'Pending':             ['बाकी', 'प्रलंबित'],
    'Done':                ['हो गया', 'झाले'],
    'Request':             ['मांग', 'मागणी'],
    'Requests':            ['मांग', 'मागणी'],
    'Dispatch':            ['भेजा', 'पाठवले'],
    'Ready':               ['तैयार', 'तयार'],
    'To make':             ['बनाना है', 'बनवायचे']
  };

  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F000}-\u{1F0FF}\u{2190}-\u{21FF}\u{2500}-\u{25FF}]/gu;
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, SVG: 1, CODE: 1, PRE: 1 };
  const orig = new WeakMap();

  // Translation is for the screens staff live in. Everywhere else this file still
  // loads — so the icon switch exists and works — but the dictionary is skipped.
  const STAFF_PAGES = ['counter-manager-v20.html', 'kitchen.html', 'chef.html'];
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const translates = STAFF_PAGES.indexOf(page) > -1;

  function staffKey() {
    const s = window.Session && Session.current && Session.current();
    return 'cs9_lang_' + ((s && s.phone) || 'device');
  }
  function lang() { try { return localStorage.getItem(staffKey()) || 'en'; } catch (e) { return 'en'; } }
  function icons() { try { return localStorage.getItem('cs9_icons') !== 'off'; } catch (e) { return true; } }

  // The bottom tab bar keeps its icons whatever this says: there the emoji IS the
  // icon, and stripping it leaves four bare words with nothing to aim a thumb at.
  function inNav(node) {
    for (let p = node.parentElement; p; p = p.parentElement) {
      if (p.tagName === 'NAV' || p.classList.contains('nav')) return true;
    }
    return false;
  }

  function paint() {
    const L = lang(), showIcons = icons();
    // The sheet is shared, so it translates on every screen; the rest of a
    // non-staff page does not.
    const col = L === 'hi' ? 0 : L === 'mr' ? 1 : -1;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.parentElement || SKIP[n.parentElement.tagName]) return NodeFilter.FILTER_REJECT;
        if (n.parentElement.closest('[data-no-i18n]')) return NodeFilter.FILTER_REJECT;
        // A node this pass has already emptied still has to be reachable, or
        // turning icons back on could never repopulate it from `orig` and every
        // glyph-only button stayed blank until a reload.
        return (n.nodeValue.trim() || orig.has(n)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    for (let n; (n = w.nextNode());) nodes.push(n);

    nodes.forEach(n => {
      if (!orig.has(n)) orig.set(n, n.nodeValue);
      const src = orig.get(n);
      const lead = (src.match(/^\s*/) || [''])[0];
      const tail = (src.match(/\s*$/) || [''])[0];
      let body = src.trim();

      const bare = body.replace(EMOJI, '').replace(/\s+/g, ' ').trim();
      const inSheet = !!(n.parentElement && n.parentElement.closest('#cm-set-bg'));
      const hit = col >= 0 && (translates || inSheet) && D[bare] ? D[bare][col] : null;
      const ic = (body.match(EMOJI) || []).join('');

      if (hit) body = (showIcons && ic ? ic + ' ' : '') + hit;
      // No `|| body` fallback here. An emoji-ONLY node strips to an empty string,
      // and falling back to the original left exactly the nodes the switch exists
      // to clear — the standalone glyph buttons — untouched.
      else if (!showIcons && !inNav(n)) body = bare;

      const next = lead + body + tail;
      if (n.nodeValue !== next) n.nodeValue = next;
    });
  }

  let queued = false;
  function repaint() {
    if (queued) return;
    queued = true;
    // rAF alone is not enough: it does not fire on a backgrounded or sleeping
    // tablet, so a language tap made as the screen dims would sit half-applied
    // until the next frame. The timer races it; whichever arrives first wins.
    const run = () => {
      if (!queued) return;
      queued = false;
      try { paint(); } catch (e) { console.warn('i18n', e); }
    };
    requestAnimationFrame(run);
    setTimeout(run, 60);
  }

  window.I18N = {
    langs: LANGS,
    translates: translates,
    get: lang,
    iconsOn: icons,
    set(code) {
      if (!LANGS[code]) return;
      try { localStorage.setItem(staffKey(), code); } catch (e) {}
      repaint();
    },
    setIcons(on) {
      try { localStorage.setItem('cs9_icons', on ? 'on' : 'off'); } catch (e) {}
      repaint();
    },
    repaint: repaint,
    // Reports read this and stay English regardless of the screen language.
    reportLang: function () { return 'en'; }
  };

  function start() {
    // Screens rebuild their innerHTML constantly — every sale redraws the cart.
    // Without an observer the language would silently revert as soon as anything
    // was rendered, which reads as "the setting doesn't work".
    paint();
    new MutationObserver(repaint).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
