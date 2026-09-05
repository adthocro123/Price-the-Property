# Price the Property 🏡💰

A "Price Is Right"–style mobile web game: guess the price of real homes,
then unlock a Mansion Expansion, a Hawaii Expansion, and a Car Expansion.
Closest without going over wins points, coins, and streaks. Built as a
plain static site so it hosts for free on GitHub Pages.

## What's here

```
index.html / style.css / app.js   The game itself (no build step needed)
data/*.json                       Property & vehicle listings the game reads
scripts/fetch-properties.js       Pulls real listings from RentCast + Street View
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

## 3. Turn on real listings (RentCast + Street View)

1. Get a RentCast API key: https://www.rentcast.io/api
2. Get a Google Maps API key with the **Street View Static API** enabled:
   https://console.cloud.google.com/ (billing must be enabled on the
   project, but Google includes a monthly free credit that comfortably
   covers a hobby-scale game).
3. In your GitHub repo, go to **Settings → Secrets and variables →
   Actions → New repository secret** and add:
   - `RENTCAST_API_KEY`
   - `GOOGLE_MAPS_API_KEY`
4. Go to the **Actions** tab, open "Refresh property listings", and click
   **Run workflow** to fetch immediately (it also runs automatically every
   Monday). It commits fresh data straight into `data/*.json`.
5. Adjust which listings show up per pack (city, state, price range) by
   editing the `PACKS` array at the top of `scripts/fetch-properties.js`.

There's no equivalent "RentCast for used cars," so the **Car Expansion**
(`data/vehicles-car.json`) is meant to be edited by hand — add more entries
in the same shape whenever you want fresh cars.

## 4. Turn on real payments (DLCs + subscription)

Payments are handled by **Stripe Payment Links** — no backend required.

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
