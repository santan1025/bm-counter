# Hosting on GitHub Pages

The app is pure static HTML + Supabase, so Pages serves it as-is.
Everything in the app uses **relative** paths (`./index.html`, `sw.js`,
`manifest.json` scope `./`), so it works fine from a subfolder URL like
`https://USER.github.io/REPO/`.

## One-time setup

1. **New public repo** on github.com — name it `bm-counter`.
   (Pages needs the repo to be public on the free plan. The repo holds no
   secrets: the Supabase anon key is public by design and protected by RLS.)

2. **Upload the files.** On the repo page: *Add file → Upload files*, drag in
   the **contents** of `deploy/` (not the folder itself — `index.html` must sit
   at the repo root). Commit.

3. **Turn Pages on.** *Settings → Pages → Source: Deploy from a branch →
   Branch: `main`, folder: `/ (root)` → Save.* Wait ~1 minute.
   Your URL is `https://USER.github.io/bm-counter/`.

## Then update two places, or sign-in breaks silently

**Google Cloud Console** → APIs & Services → Credentials → your OAuth client:
- Authorized JavaScript origins: add `https://USER.github.io`
- Authorized redirect URIs: add the Supabase callback (unchanged) *and*
  `https://USER.github.io/bm-counter/login.html`

**Supabase** → Authentication → URL Configuration:
- Site URL: `https://USER.github.io/bm-counter/`
- Redirect URLs: add `https://USER.github.io/bm-counter/**`

Leave the Netlify URLs in both lists until the shop is fully moved over —
having both is allowed and means neither host breaks mid-week.

## What you lose versus Netlify

`_headers` is a Netlify file. GitHub Pages ignores it, so the app runs
**without** the CSP and the `Cache-Control: no-cache` rules.

- **CSP** only restricts what the page may load. Losing it is a security
  downgrade, not a breakage — nothing in the app stops working.
- **no-cache** mattered more: it guaranteed a phone never ran last week's
  `sync.js`. Pages caches assets for about 10 minutes, so after you push a
  fix, tell staff to pull-to-refresh once, or wait 10 minutes.

Keep `_headers` in the repo. It costs nothing and is correct again the moment
you move to Cloudflare Pages, which reads the same file.

`.nojekyll` is here so GitHub doesn't hide files beginning with `_`.

## Updating the app later

*Add file → Upload files* again with the changed files, commit. Pages
redeploys in under a minute.
