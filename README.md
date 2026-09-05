# Price the Property 🏡💰

A "Price Is Right"–style mobile web game: guess the price of real homes,
then unlock a Mansion Expansion, a Hawaii Expansion, and a Car Expansion.
Closest without going over wins points, coins, and streaks. Built as a
plain static site so it hosts for free on GitHub Pages.

## What's here

```
index.html / style.css / app.js   The game itself (no build step needed)
data/*.json                       Property & vehicle listings the game reads
scripts/fetch-properties.js       Pulls real listings (RentCast) + aerial photos (USGS)
.github/workflows/refresh-data.yml   Runs that script on a schedule
.github/workflows/pages.yml       Deploys the site to GitHub Pages
manifest.json / assets/icon.svg   "Add to Home Screen" support
```

The game ships with realistic-looking **demo data** and placeholder photos
so it's playable immediately. Follow the steps below to switch on real
listings and real payments whenever you're ready — neither is required for
the game to work.

## 1. Turn on GitHub Pages

1. Push this repo to `github.com/adthocro123/Price-the-Property` (see the
   git commands at the bottom of this file).
2. In the repo, go to **Settings → Pages**, and under "Build and
   deployment" choose **GitHub Actions** as the source. The included
   `.github/workflows/pages.yml` will deploy on every push to `main`.
3. Your game will be live at `https://adthocro123.github.io/Price-the-Property/`.

## 2. Why the API keys aren't just "in the code"

GitHub Pages only serves static files — there's no server. Any key you put
in `app.js` or `index.html` is visible to anyone who views the page source,
which means they could copy your RentCast or Google Maps key and rack up
charges on your account. The fix used here: **fetch the data ahead of
time**, using a private automation (GitHub Actions) that has the keys, and
have the game read the plain results. The browser never sees a key.

## 3. Turn on real listings (RentCast + free aerial photos)

**Only one key is needed, and the photos cost nothing.**

1. Get a RentCast API key: https://www.rentcast.io/api (the free Developer
   plan allows 50 API calls/month and needs no credit card).
2. In your GitHub repo, go to **Settings → Secrets and variables →
   Actions → New repository secret** and add `RENTCAST_API_KEY`.
3. Go to the **Actions** tab, open "Refresh property listings", and click
   **Run workflow** to fetch immediately. It also runs automatically every
   3 days, committing fresh listings straight into `data/*.json`.
4. Adjust what shows up per pack (price range, property type, state, year
   built) by editing the `PACKS` array at the top of
   `scripts/fetch-properties.js`. Those filters are sent to RentCast
   directly, so they search the whole database rather than filtering a
   small sample.

### Adding your own pack

A pack is one RentCast query. To add one:

1. Add an entry to `PACKS` in `scripts/fetch-properties.js` with a `key`,
   `outFile`, `label`, the `rentcastParams` to search by, and a
   `priceRange` sanity check.
2. Add a matching entry to `CONFIG.packs` in `app.js` (emoji, name, the
   same data file, `maxGuess` for the slider, and either `free: true` or a
   price plus `stripeLink`).
3. Run the refresh workflow. Until it runs, the pack politely reports that
   it's waiting on data rather than breaking.

Useful filters: `price`, `squareFootage`, `lotSize`, `yearBuilt` and
`bedrooms` all take a `"min:max"` range; `propertyType` and `city`/`state`
take exact values, and `propertyType` accepts `"Single Family|Condo"`.
Each pack costs one API call per refresh, so keep an eye on the budget
below when adding several.

### Where the photos come from

RentCast returns listing *data* but no photos (MLS photos are licensed by
the listing brokerage, so no affordable API hands them out — and reusing
them in a paid game would be a copyright problem).

Instead, each listing's latitude/longitude is turned into a real aerial
photo of that exact address from the **USGS National Map**. That imagery is
US federal government work in the **public domain**: free forever, no API
key, no billing account, no attribution required, and nothing secret ends
up inside the committed data files. The game centres each photo on the home
and draws a marker over the middle so players know which house is theirs.

Because it's US-only imagery, it covers every listing RentCast returns
(including Hawaii). Each refresh pulls 100 listings per pack, so there are
~800 properties in rotation.

### What this costs (and the guard that keeps it at $0)

Nothing here bills you *except* RentCast, and only if you blow past its
free allowance:

| Piece | Cost |
| --- | --- |
| USGS aerial photos | Free forever — public domain, no key, no account |
| GitHub Pages + Actions | Free for public repos |
| RentCast | 50 requests/month free, then **$0.20 per request** |

The catch is that RentCast **does not stop you** at 50. Their docs are
explicit: *"We do not currently support hard usage caps or automatic API
request blocking when you reach your current plan's monthly request
limit"* — they bill the overage instead, and recommend you enforce your
own cap.

So `scripts/fetch-properties.js` enforces one. It keeps a running count in
`data/api-usage.json` (committed, so it survives between runs), resets on
the 1st of each month, and refuses to make another request once it hits
`MONTHLY_CALL_BUDGET` — set to **40**, deliberately below the free 50.
When it stops it leaves existing listings untouched and says so in the
workflow log.

Normal usage: one call per pack (8), twice a month = **16 calls**. That
leaves room for roughly three extra manual runs before the guard trips,
and the guard trips ten calls before RentCast would charge you anything.

If you ever add packs, remember each one costs a call per refresh — check
the budget line the script prints at the end of every run.

### Want street-level photos instead?

Google Street View is the obvious upgrade but needs a credit card on file,
and its key would be visible inside every committed image URL. A free
alternative is **Mapillary** (crowdsourced, open-licensed, free API token,
no card) — the catch is that residential-street coverage is patchy, so
you'd want to fall back to the aerial photo whenever a location has none.
Ask me if you want that wired up.

There's no equivalent "RentCast for used cars," so the **Car Expansion**
(`data/vehicles-car.json`) is meant to be edited by hand — add more entries
in the same shape whenever you want fresh cars.

Because the aerial imagery needs no key, the only secret this project has
is `RENTCAST_API_KEY`, and it never leaves the GitHub Actions runner.

## 4. Turn on real payments (DLCs + subscription)

Payments are handled by **Stripe Payment Links** — no backend required.

**Testing for free before you wire up Stripe:** as long as a pack's
`stripeLink` in `app.js` still contains `REPLACE_...` (the default), tapping
"Unlock"/"Subscribe" in the store grants that pack for free instead of going
to checkout — a toast tells you it's a test unlock. This lets you fully play
every expansion during development. The moment you paste in a real Payment
Link, that button switches to real Stripe checkout automatically. You can
also use **Stripe's own Test mode** (toggle in the dashboard) to build and
click through a real checkout page with test card `4242 4242 4242 4242`
(any future expiry/CVC/ZIP) without it charging anything — useful for
testing the actual redirect-and-unlock flow end to end before going live.

1. Create a free Stripe account: https://dashboard.stripe.com/register
2. For each of the 4 products below, go to **Payment links → New**:
   - Mansion Expansion — $4.99, one-time
   - Hawaii Expansion — $4.99, one-time
   - Car Expansion — $4.99, one-time
   - Property Pro — pick a monthly price, recurring
3. On each Payment Link, open **"After payment"** and choose **"Don't show
   confirmation page" → redirect to a URL**. Set it to your site with a
   matching `unlocked` value:
   - `https://adthocro123.github.io/Price-the-Property/?unlocked=mansion`
   - `https://adthocro123.github.io/Price-the-Property/?unlocked=hawaii`
   - `https://adthocro123.github.io/Price-the-Property/?unlocked=car`
   - `https://adthocro123.github.io/Price-the-Property/?unlocked=pro`
4. Copy each Payment Link URL into `app.js`, near the top, replacing the
   `stripeLink: "https://buy.stripe.com/REPLACE_..."` placeholders.
5. Commit and push — the store screen will now send players to real Stripe
   checkout, and a successful payment unlocks that pack in their browser.

**Good to know:** this unlock check trusts the redirect URL, which is fine
for a solo/small-scale launch, but someone technical could type the URL by
hand to fake an unlock. If the game takes off and that becomes worth
closing, the standard fix is a small serverless function (e.g. a
Cloudflare Worker or Vercel function) that verifies the Stripe session
server-side before returning the unlock — ask me if/when you want that
built. Likewise, the "Property Pro" subscription is checked as a one-time
unlock, not a live "is this still paid?" status — closing that gap also
needs a small backend that listens for Stripe's subscription-cancelled
webhook.

## 5. Editing content

- **House/mansion/Hawaii listings**: usually auto-managed by the fetch
  script (see step 3), or hand-edit `data/properties-*.json` directly —
  each entry is plain JSON.
- **Cars**: hand-edit `data/vehicles-car.json`.
- **Colors/branding**: all in `style.css` (`:root` variables at the top).
- **Scoring, round count, guess ranges**: top of `app.js` (`CONFIG`
  object) and the `submitGuess()` function.

## 6. Running it locally

No build step — any static file server works:

```
npx http-server -p 8080 -c-1
```

Then open http://localhost:8080. (Opening `index.html` directly by
double-clicking also mostly works, though `fetch()` of the JSON files
behaves better through a real server.)

## Pushing this to GitHub

```
git init
git add .
git commit -m "Initial commit: Price the Property"
git branch -M main
git remote add origin https://github.com/adthocro123/Price-the-Property.git
git push -u origin main
```

Then flip on Pages as described in step 1.
