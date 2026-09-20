# Price the Property 🏡💰

A "Price Is Right"–style mobile web game: guess the price of real homes,
then unlock a Mansion Expansion, a Hawaii Expansion, and a Car Expansion.
Closest without going over wins points, coins, and streaks. Built as a
plain static site so it hosts for free on GitHub Pages.

## What's here

```
index.html / style.css / app.js   The game itself (no build step needed)
config.js                         Your Google Maps browser key — the one file
                                  you edit to switch street views on
data/*.json                       Property & vehicle listings the game reads
scripts/fetch-properties.js       Pulls real listings (RentCast), finds which
                                  homes have street coverage, adds aerial photos
.github/workflows/refresh-data.yml   Runs that script on a schedule
.github/workflows/pages.yml       Deploys the site to GitHub Pages
manifest.json / assets/icon.svg   "Add to Home Screen" support
```

Homes are shown as **real Google Street View panoramas** you can drag to
look around, with a free public-domain aerial photo as the fallback for
addresses no Street View car ever reached. Street views need a Google Maps
key (step 3b); without one the game still plays fine on aerial photos
alone. Follow the steps below to switch on real
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

## 3. Turn on real listings (RentCast) and street views (Google)

Two independent switches. Each works without the other, and the game runs
with neither:

| Switch | What it gives you | Key | Costs |
| --- | --- | --- | --- |
| **3a** RentCast | real homes, real asking prices | `RENTCAST_API_KEY` | free tier, no card |
| **3b** Google | real street views of those homes | a Google Maps key | $0 in the default setup, but a card is required to create one |

### 3a. Real listings — RentCast

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

### 3b. Real street views — Google Maps

This is the part that makes it feel like Zillow: every home shown as a
panorama you can drag around, taken from the road outside its front door.

**You will need a Google Cloud account with a card on file.** Google
requires one before it hands out any Maps key, even for the free services.
The default setup uses only services Google lists at *unlimited, no
charge*, so the bill stays at $0 — and step 5 below adds a hard cap so it
cannot quietly stop being $0.

You'll create **two keys**, because they're used in two different places
with two different restrictions. Both come from the same project.

1. Create a project at https://console.cloud.google.com/ and attach a
   billing account when prompted.

2. In **APIs & Services → Library**, enable these two:
   - **Maps Embed API** — draws the panorama in the game
   - **Street View Static API** — its metadata endpoint is what finds which
     homes have coverage

3. **Key 1 — the browser key** (goes in `config.js`, public by design).
   In **APIs & Services → Credentials → Create credentials → API key**:
   - *Application restrictions* → **Websites**, and add:
     - `https://adthocro123.github.io/*`
     - `http://localhost:8080/*` (so you can test locally)
   - *API restrictions* → **Restrict key** → tick **Maps Embed API** only.
   - Copy it into `googleMapsBrowserKey` in `config.js`, commit, push.

   This key is visible to anyone who views your page source. That's
   unavoidable on a static site and it's fine: the website restriction
   means Google refuses it from anywhere but your own game, and the Embed
   API is free and unlimited, so there's nothing to run up.

4. **Key 2 — the server key** (lives in GitHub Actions, never public).
   Create a second API key and:
   - *Application restrictions* → **None**. The refresh script runs on a
     GitHub server and sends no referrer, so a website restriction would
     reject it. (This is why it must be a separate key from the browser
     one.)
   - *API restrictions* → **Restrict key** → tick **Street View Static
     API** only.
   - Add it in **Settings → Secrets and variables → Actions → New
     repository secret** as `GOOGLE_MAPS_SERVER_KEY`.

5. **Set the hard cap.** This is the step that guarantees $0. Under
   **APIs & Services → Street View Static API → Quotas**, set the daily
   request limit to something small (10 is plenty — the refresh only uses
   the free metadata endpoint, so it should never touch this). Google
   enforces quotas by *refusing requests*, not by billing you for them,
   which is exactly the guarantee RentCast doesn't offer.

6. Run the **Refresh property listings** workflow again. It now records,
   for each home, where the nearest Street View camera stands and which way
   it has to turn to face the house.

**You don't have to wait for step 6** — as soon as the browser key from
step 3 is in `config.js`, street views start working on the listings you
already have. The refresh just makes the camera angles exact: without it
Google picks the direction, and it sometimes opens facing the wrong way.
(The Street View Static API documents that it points the camera at the
address when you don't give it a heading; the Embed API used for the
interactive panorama documents no such default, which is why an
un-refreshed home can open facing a hedge. Players can drag round to the
house; a refresh fixes it properly.)

**If something looks wrong:**

- *Every home shows the aerial photo* — the browser key is missing,
  mistyped, or still the placeholder. Open the browser console on your
  live site; Google says plainly when it rejects a key.
- *The panorama says "no imagery"* — no Street View car reached that
  address. Tap **🛰️ From above** to see the aerial instead. Running the
  refresh (step 6) largely removes these, because it prefers homes that
  have coverage.
- *The workflow log says "Street View lookups disabled for this run"* — the
  server key is wrong, restricted to a referrer, or missing the Street View
  Static API. The log prints Google's own reason. Listings fall back to
  aerial photos, so nothing breaks in the meantime.

### Where the pictures come from

RentCast returns listing *data* but no photos (MLS photos are licensed by
the listing brokerage, so no affordable API hands them out — and reusing
them in a paid game would be a copyright problem). So the game builds its
own pictures from each listing's latitude and longitude, two ways:

**Street view (the main event).** During a refresh, each address is put to
Google's Street View *metadata* endpoint, which answers "is there a
panorama near here, and where exactly was it taken?" — and returns no
imagery, which is why Google lists it as unlimited and free. From the
camera's position the script works out the compass bearing to the house and
stores it. In the game, the browser turns those numbers into a panorama
with your own restricted key. No key and no image ever passes through the
committed data files.

Homes that have coverage are preferred when filling a pack, so most rounds
are a real street view. If a pack runs out of covered homes it tops up with
uncovered ones rather than shipping short.

**Aerial (the fallback).** Every listing also carries a top-down photo of
the same spot from the **USGS National Map** — US federal government work
in the **public domain**: free forever, no API key, no billing account, no
attribution. It covers every listing RentCast returns, including Hawaii.
This is what players see when a home has no street coverage, when no
browser key is set yet, and whenever they tap **🛰️ From above** because a
tree is parked in front of the house. The reticle in the middle marks which
building is theirs.

Each refresh pulls 100 listings per pack, so there are ~800 properties in
rotation.

### What this costs (and the guard that keeps it at $0)

In the default setup, the only thing here that can bill you is RentCast,
and only if you blow past its free allowance:

| Piece | Cost |
| --- | --- |
| **Maps Embed API** — the panoramas players actually see | **Unlimited, free.** Google's pricing list marks this SKU as unlimited free usage, with no monthly cap to exceed |
| **Street View metadata** — finding which homes have coverage | **Unlimited, free.** Same: it returns coordinates, never imagery |
| **Street View Static API** — only if you set `streetViewMode: "photo"` | 10,000 requests/month free, then **$7.00 per 1,000** |
| USGS aerial photos | Free forever — public domain, no key, no account |
| GitHub Pages + Actions | Free for public repos |
| RentCast | 50 requests/month free, then **$0.20 per request** |

So street views cost nothing to run as shipped. The one line that could
change that is `streetViewMode` in `config.js`: leave it on `"interactive"`
and you're on the unlimited-free Embed API forever. Switch it to `"photo"`
and every round spends a billable Street View Static request — which is
still free for the first 10,000 a month, and which the daily quota cap from
step 3b.5 stops dead rather than billing you for. Google enforces quotas by
refusing requests; that's a real cap, not a warning.

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

### Can't use a credit card?

Google won't issue a Maps key without a card on file, even for the free
services. If that's a blocker, the open alternative is **Mapillary**:
crowdsourced street-level photos, open-licensed, free API token, no card.
The catch is that residential coverage is patchy — good in city centres,
thin in the suburbs where most of these listings are — so a lot of rounds
would fall back to the aerial photo. The fallback machinery is already
built, so wiring Mapillary in as a third source is a contained change.
Ask me if you want it.

There's no equivalent "RentCast for used cars," so the **Car Expansion**
(`data/vehicles-car.json`) is meant to be edited by hand — add more entries
in the same shape whenever you want fresh cars.

Two of the three keys here are secrets and one is deliberately public:
`RENTCAST_API_KEY` and `GOOGLE_MAPS_SERVER_KEY` never leave the GitHub
Actions runner, while the browser key in `config.js` is served to every
player and is kept safe by its website restriction instead.

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
- **Street views**: `config.js` — the browser key, and `streetViewMode`
  (`"interactive"` for a draggable panorama, `"photo"` for a flat image,
  `"off"` for aerial only).
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
