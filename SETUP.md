# BM Ventures — setup guide

Everything needed to get four phones running this week. Follow it in order; step 1 must be
done before any phone is touched.

---

## What is in this folder

| File | What it is |
|---|---|
| `index.html` | The login screen. **This is the front door** — every phone opens this. |
| `login.html` | Same file. Screens redirect here when nobody is signed in. |
| `counter-manager-v20.html` | Counter app (the one you already know) + the live bridge |
| `chef.html` | Chef's make-list — phone, read only |
| `kitchen.html` | Kitchen manager's board — requests, packing, dispatch, invoices |
| `owner.html` | Owner — every shop, profit, what needs attention |
| `sync.js` | The live layer every screen reads and writes through |
| `session.js` | Logins, roles, punch in/out. Shops live here; staff live in the `staff_accounts` table |
| `supabase-config.js` | Fallback place for the keys (usually not needed) |
| `backup.html` | Backup into your own Google Drive, and who may sign in with Google |
| `google.js` | Google sign-in and the Drive backup itself |
| `google-setup.sql` | One column, for Google sign-in. Run once. |

## Connecting the phones

Nothing to do. The project keys ship inside `supabase-config.js`, so every phone that opens
the app is connected on first load. A phone that is genuinely not connected — paused project,
no data — says so in red across the bottom of every screen.

**Before real sales go in:** run `supabase-lockdown.sql`. Until then the key in the app
grants read and write on everything to anyone holding it, so keep the link private.

## Run this once: this app's own tables

`app-tables.sql`, in Supabase → SQL Editor. Creates `staff_accounts` (the roster — until it
exists, a PIN set on one phone is unknown to the others) and `cm_sales` (till receipts —
until it exists the owner screen shows no revenue at all).

This project is shared with the older Next.js app, which owns `shops`, `staff`, `sales`,
`products` and `cm_records`, all keyed by uuid. This app keys by readable text ids, so it
must not share those tables — writes were being rejected silently. It now has its own two
and touches nothing of the other app's.

## Staff and PINs

One row per person **per role**. A number can hold several — Tanmay's number is the shop 1
counter, the owner, and for now the kitchen manager — and **the PIN decides which screen
opens**. No PIN is issued: the first sign-in on a number creates it.

| Person | Number | Roles |
|---|---|---|
| Tanmay Salve | 8767569788 | Counter (MS Clubhouse) · Owner · Kitchen manager (temporary) |
| Tanmay | 8454886933 | Counter (Mulund Store) |
| Yashwant Singh | 7995844027 | Kitchen chef |

The owner and kitchen-manager logins are **hidden**: they are never listed, and are only
offered on a phone marked as yours — **long-press the shop logo** on the login screen for
about a second. Press again to un-mark. Hiding does not grant anything; the PIN still has
to be right.

Forgotten PIN: it is reset, not recovered. Clear that person's `pin_hash` in the `staff`
table and their next sign-in sets a new one.

## Step 1 — Supabase (10 minutes, do this first)

You already have a project, so nothing new to create.

1. Open your project → **SQL Editor** → **New query**.
2. Paste the whole of `supabase-schema.sql` → **Run**.
3. It should say success. Safe to run again any time — every statement is
   create-if-not-exists, and your existing `cm_records` table is not touched.

Then go to **Settings → API** and copy two things somewhere you can paste from on a phone
(a WhatsApp message to yourself is fine):

- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public** key — a long string starting `eyJ`

> ⚠ On the same page there is a **service_role** key. Do not copy it, do not paste it into
> the app, do not send it to me. It bypasses every security rule. The anon key is the one
> that is designed to live in an app.

---

## Step 2 — Publish this folder

Upload the whole folder to the same web address you used for v18 (same host, same method).

Check it worked: open the address on your laptop. You should see the **Sign in** screen,
not the counter app. If you still see the counter app, the old `index.html` is cached —
hard-refresh once (Ctrl+Shift+R).

---

## Step 3 — Set up each phone (2 minutes each)

Do this on all four: your counter phone, the chef's, the kitchen manager's, the owner's.

1. Open the address in **Chrome** (Android) or **Safari** (iPhone).
2. On the sign-in screen, scroll down and tap **Connect this phone**.
3. Paste the **Project URL** and the **anon public** key.
4. Pick **which shop this phone belongs to**:
   - Your counter phone → the shop you are working in that day
   - Chef's phone and kitchen manager's phone → **Rabale Kitchens**
   - Owner's phone → any shop; the owner screen shows all of them regardless
5. Tap **Connect this phone**. It reloads.
6. **Add to Home Screen** (Chrome: ⋮ → Add to Home screen · Safari: Share → Add to Home
   Screen) so it opens without browser bars.
7. Sign in.

You only do this once per phone. After that it stays connected.

**How to tell it worked:** the pill at the top of the chef, kitchen and owner screens says
**● Live**. If it says *This device only*, the keys did not save — repeat step 2–5.

---

## Step 4 — Logins

| Person | Phone number | PIN | Opens |
|---|---|---|---|

Signing in punches you in for the day. The chip in the top-right of every screen shows
your name and hours; tap it to punch out and sign out.

Counter staff can only sign in on their own shop's phone — Kiran cannot sign in on the MS
Club House phone, because his bills would land in the wrong shop's books. Chef, kitchen
manager and owner sign in anywhere.

### Putting the real names in

Open `session.js`, find `SEED_STAFF` near the top, and replace the rows with real names,
real phone numbers and PINs you choose. Re-publish. On a phone that already has the old
list, the app keeps its copy — to force a refresh, sign out, and in the browser address
bar of that phone clear site data (or just use a fresh PIN row with a new number).

---

## Step 5 — Clear the old test data (do this once)

On your own phone, open the **chef** screen and tap **Remove test data**, then
**Load a test day** again.

Why: earlier test rows used invented cake names that are not in the product list, so the
kitchen board prices them at ₹0 and looks broken. The new test data is built from your real
64 products and bills properly.

---

## How the day flows

**Counter (you)** — sign in, sell as normal. When you place a restock order
(Orders → Place Restock Order), it now also goes to the kitchen automatically. You get a
message when the kitchen dispatches to you.

**Chef** — opens the phone and sees, in order: special orders due today and tomorrow (with
the message on the cake, photo, flavour, weight, shape, egg or eggless, colour, allergy),
then everything to make — switchable between **by cake** (totals across shops) and
**by shop**. No money anywhere on this screen. He marks nothing; he just reads.

**Kitchen manager** — sees every shop's request. Taps one, the packed quantities are
pre-filled with what was asked, he only changes the lines he is short on, then
**Send & invoice** — that marks it gone and raises the invoice number in one step. Nothing
gets typed twice at the end of the day.

**Owner** — profit first (takings minus goods minus expenses minus wastage), then
**Needs your attention**: a shop that has not rung up a bill by 2pm, a shop that did not
close yesterday, cash short or over, one person's discounts running high, wastage above 5%,
a cake due today the kitchen has not started, an advance on an overdue order, a shop
waiting hours for restock. A clean day says "Nothing needs you". Then cash sitting in each
shop, each shop against its own same weekday last week, advances he is holding, wastage,
and staff hours.

---

## What to watch for this week

- Two phones in one shop: do both show the same bill count by closing?
- Chef's phone: does a restock request appear within a few seconds of you sending it?
- Kitchen board: does the invoice total match what he would have written by hand?
- Owner screen: does "Needs your attention" ever say something that is not true?
- Does anyone get stuck at the login — and what exactly did they type?

Write down anything odd with the time it happened. That is what I need to fix it.

---

## Known gaps — say these to the client before he finds them

1. **Security rules are still off.** Any phone holding the anon key can read every shop's
   data. Fine for four phones you control. **`supabase-lockdown.sql` must be run before
   real staff use this**, and that needs proper staff accounts first.
2. **Attendance is not location-verified.** A punch-in can happen from anywhere, including
   home. **Do not calculate anyone's salary from this week's data.**
3. **Profit is approximate** until the cost-price photos arrive. Items with no cost price
   are flagged on the owner screen rather than silently guessed.
4. **Sales between two counter phones can lag up to a minute** in some cases — the counter
   app's original 60-second sync still runs alongside the new live one.
5. **No GST work, no salary calculation, no all-shops export yet.**
6. **Chef and kitchen screens have no punch screen of their own** — they punch in at login.
7. **Special orders are still entered in the counter app.** The chef screen shows them
   correctly, but photos have to be added from the counter side.

---

## If something goes wrong

**"This device only" instead of "Live"** — keys did not save. Sign out, tap Connect this
phone, paste again. Check the URL ends in `.supabase.co` with no trailing slash.

**Signed in but sent back to the login** — that role does not own that screen. Sign in as
the right person — each role only opens its own screen.

**Kitchen board shows ₹0 invoices** — the products on that request have no price in the
counter app. It warns you before sending. Set the prices in the counter app → Products.

**Someone forgot to punch out** — it auto-closes at midnight, and the owner screen flags
anyone punched in more than 13 hours.

**Phone shows an old version** — it caches for offline use. Close the app fully and reopen,
or clear the site's cache. A republish is picked up on the next load with a signal.

**Anything broken mid-service** — the counter app keeps selling even if the live layer
fails completely. That is deliberate. Sell first, tell me after.


---

## Google sign-in, and backups into your Drive

Two features, one consent screen. Both are optional — the app works exactly as before
without either, and nothing here changes how staff sign in with a number and PIN.

**What Google sign-in is for.** Managers and the owner open the app with their own Google
account instead of a PIN. This is the per-staff login that was outstanding: it closes the
shared-key exposure for the people who see money figures, without asking a shop assistant
to remember another four digits.

**What it is not.** Counter phones stay on number-and-PIN. A counter phone is shared, sits
on a till, and is usually not signed into anyone's personal Google account — a Google-only
login there would lock the shop out on a busy morning.

### Setting it up — about fifteen minutes, once

**1. Google Cloud** — <https://console.cloud.google.com>

- Create a project (any name).
- **APIs & Services → Library → Google Drive API → Enable.** Miss this and sign-in works
  while backups fail with a permission error that names nothing.
- **OAuth consent screen:** External. Add your own Google account under **Test users**
  while it is unpublished, or sign-in is refused for everybody including you.
- **Scopes:** add `.../auth/drive.file` — this app can only touch files it created itself.
  It cannot read the rest of your Drive.
- **Credentials → Create credentials → OAuth client ID → Web application.**
  Authorised redirect URI, exactly:
  `https://<your-project>.supabase.co/auth/v1/callback`
  Copy the **client ID** and **client secret**.

**2. Supabase** — Authentication → Providers → Google

- Enable it, paste the client ID and secret, Save.
- **Authentication → URL Configuration → Redirect URLs:** add your Netlify address and
  `https://<your-site>/*`. A missing entry here is the usual cause of landing back on the
  login screen still signed out.

**3. The app**

- Run `google-setup.sql` in Supabase → SQL Editor.
- Sign in on your phone with your number and PIN as owner.
- Open **Backup & Google** from the all-screens menu.
- Continue with Google, then put each manager's email on their row.

An email on a staff row **is** the access. No email, no Google entry — and nobody can add
their own, because that screen is owner-only and needs a PIN sign-in first. An unknown
Google account gets told to ask an owner, and gets nothing else.

### The backup — and its one honest limit

A backup writes into a **BM Ventures Backups** folder in the Drive of whoever pressed the
button. Two things land there:

- **A restore file** (`bm-backup-<date>.json`) — every shared table plus every setting on
  that phone: staff names, UPI, counter safe, prices. Those settings are what was lost
  once before, and records without them restore a shop that cannot open.
- **Readable sheets** — sales, requests, dispatches, expenses, damage and punches as Google
  Sheets, openable in Sheets or Excel with no app involved.

**A browser can hold Drive permission for about an hour and cannot renew it quietly.** So
backups run while a manager is on that screen: a button, plus one reminder per session.
There is no automatic 2am backup, and the app does not pretend to offer one — that needs a
server, which this app does not have. A manager pressing it once at close of day is enough.

**Restoring merges.** Records come back and the newer version of any row wins, so restoring
an old backup adds what is missing and cannot revive figures that have moved on. Settings
are asked about separately, because an old counter safe written over today's is exactly the
quiet loss this screen exists to undo.

**Why bother, when Supabase already holds everything.** Supabase is the live copy and a lost
phone loses nothing. A Drive backup is a copy **you** own, in an account nobody can revoke,
readable without this app — for the day the subscription lapses, the database is deleted by
mistake, or somebody wants last March's takings in a spreadsheet.

### ⚠ One thing this does not fix

Google sign-in decides which **screen** opens. It does not yet decide what the **data** lets
you touch — that is `supabase-harden-now.sql`, still outstanding. Until those rules are on,
the key inside the app can read and write every table regardless of who signed in. A login
over an open database is a locked door in a glass wall. Run the hardening first; the Google
work above is worth much more with it in place.
