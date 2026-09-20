#!/usr/bin/env node
/**
 * fetch-properties.js
 * -----------------------------------------------------------------------
 * Pulls real, currently-listed homes from the RentCast API, works out where
 * you would stand on the street to look at each one, and writes the result
 * into the static JSON files the game reads (data/properties-*.json).
 *
 * Each listing gets two ways to be shown:
 *
 *   streetView - where the nearest Street View camera stands, plus the
 *                compass heading from that camera to the front of the house.
 *                Found here using Google's Street View *metadata* endpoint,
 *                which Google documents as free of charge and which returns
 *                no imagery, so nothing secret and nothing billable ends up
 *                in the committed files. The browser turns these numbers
 *                into a panorama using its own restricted key (config.js).
 *
 *   image      - a top-down USGS National Map aerial photo of the same spot.
 *                Public domain, no key, works forever. This is the fallback
 *                when a home has no street coverage, when no browser key is
 *                set yet, and when a player taps "see it from above".
 *
 * Listings WITH street coverage are preferred when filling each pack, so the
 * game shows a real street view as often as the imagery allows.
 *
 * This script is meant to run in GitHub Actions (see
 * .github/workflows/refresh-data.yml), NOT in the browser — that's what
 * keeps your RentCast key private. It reads it from an environment
 * variable, which the workflow populates from a GitHub repo secret.
 *
 * Environment variables:
 *   RENTCAST_API_KEY        - required, from https://www.rentcast.io/api
 *   GOOGLE_MAPS_SERVER_KEY  - optional. An *unrestricted* Google Maps key
 *                             (or one restricted by IP), used only for the
 *                             free metadata lookups above. Without it the
 *                             script still runs and every listing falls back
 *                             to the aerial photo, exactly as it used to.
 *                             This is NOT the key you put in config.js.
 *
 * Run locally to test (never commit your real keys):
 *   RENTCAST_API_KEY=xxx GOOGLE_MAPS_SERVER_KEY=yyy node scripts/fetch-properties.js
 * -----------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const RENTCAST_API_KEY = process.env.RENTCAST_API_KEY;
const GOOGLE_MAPS_SERVER_KEY = process.env.GOOGLE_MAPS_SERVER_KEY;
const DATA_DIR = path.join(__dirname, "..", "data");

// How far from the listed coordinates we'll accept a Street View camera.
// Most US homes sit 10-30m back from the kerb, so 60m comfortably finds the
// camera that drove past the front door without wandering onto another block.
const STREETVIEW_RADIUS_M = 60;

// Metadata lookups are free, but they're still network calls. Check at most
// this many listings per pack while hunting for street coverage.
const STREETVIEW_MAX_LOOKUPS = 320;

// How many metadata lookups to have in flight at once.
const STREETVIEW_CONCURRENCY = 8;

const IMAGE_WIDTH = 900;
const IMAGE_HEIGHT = 600;

// How much ground the aerial photo covers, left to right. A house wants a
// tight crop so it fills the frame, but zooming that far into a condo tower
// just fills the shot with white rooftop — those need enough width to show
// the building sitting in its neighborhood.
const VIEW_METERS_HOUSE = 170;
const VIEW_METERS_BUILDING = 450;
const MULTI_UNIT_TYPES = ["Condo", "Apartment", "Multi-Family"];

function viewWidthMeters(propertyType) {
  return MULTI_UNIT_TYPES.includes(propertyType) ? VIEW_METERS_BUILDING : VIEW_METERS_HOUSE;
}

// One config entry per pack this script can refresh. `rentcastParams` is sent
// straight to RentCast, so filtering happens server-side against their whole
// database rather than against a small sample. Numeric ranges use "min:max"
// and multiple values use "a|b" (see developers.rentcast.io).
const LISTINGS_PER_PACK = 100;

// Property types that make sense to price in a game about homes. Anything
// else (notably "Land") is filtered out both in the query and again after
// the fetch, since a vacant lot has no beds, baths or floor area to go on.
const HOME_TYPES = "Single Family|Condo|Townhouse|Multi-Family";
const EXCLUDED_TYPES = ["Land"];

const PACKS = [
  {
    key: "standard",
    outFile: "properties-standard.json",
    label: "Starter Homes",
    rentcastParams: {
      propertyType: "Single Family|Townhouse|Condo",
      price: "150000:650000"
    },
    priceRange: [150000, 650000]
  },
  {
    key: "mansion",
    outFile: "properties-mansion.json",
    label: "Mansion Expansion",
    rentcastParams: {
      propertyType: "Single Family",
      price: "3000000:30000000"
    },
    priceRange: [3000000, 30000000]
  },
  {
    key: "hawaii",
    outFile: "properties-hawaii.json",
    label: "Hawaii Expansion",
    rentcastParams: {
      state: "HI",
      propertyType: HOME_TYPES,
      price: "400000:10000000"
    },
    priceRange: [400000, 10000000]
  },
  {
    key: "nyc",
    outFile: "properties-nyc.json",
    label: "Big Apple",
    rentcastParams: {
      city: "New York",
      state: "NY",
      propertyType: HOME_TYPES,
      price: "200000:15000000"
    },
    priceRange: [200000, 15000000]
  },
  {
    key: "colorado",
    outFile: "properties-colorado.json",
    label: "Colorado Collection",
    rentcastParams: {
      state: "CO",
      propertyType: HOME_TYPES,
      price: "300000:10000000"
    },
    priceRange: [300000, 10000000]
  },
  {
    key: "fixer",
    outFile: "properties-fixer.json",
    label: "Fixer-Uppers",
    rentcastParams: {
      propertyType: "Single Family|Townhouse",
      price: "40000:200000"
    },
    priceRange: [40000, 200000]
  },
  {
    key: "newbuild",
    outFile: "properties-newbuild.json",
    label: "Brand New Builds",
    rentcastParams: {
      propertyType: "Single Family|Townhouse",
      yearBuilt: "2023:2026",
      price: "200000:2000000"
    },
    priceRange: [200000, 2000000]
  },
  {
    key: "historic",
    outFile: "properties-historic.json",
    label: "Historic Homes",
    rentcastParams: {
      propertyType: "Single Family",
      yearBuilt: "1800:1940",
      price: "150000:3000000"
    },
    priceRange: [150000, 3000000]
  }
];

// Every pack asks for the largest page RentCast allows, so one call per pack
// yields a deep pool to sample from. That keeps the whole refresh within the
// free tier's monthly call budget.
const SHARED_PARAMS = { limit: "500", status: "Active" };

// RentCast's free tier covers 50 calls/month and they explicitly do NOT block
// requests past it — they bill overage per request instead. Their docs tell
// you to enforce your own cap, so this is it: the count lives in a committed
// file, survives between workflow runs, and resets each calendar month.
// Stopping at 40 leaves a deliberate buffer under the free allowance.
const MONTHLY_CALL_BUDGET = 40;
const USAGE_FILE = path.join(DATA_DIR, "api-usage.json");

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function readUsage() {
  try {
    const saved = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    if (saved.month === currentMonth()) return saved;
  } catch (e) { /* no file yet — start fresh */ }
  return { month: currentMonth(), calls: 0 };
}

function writeUsage(usage) {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2) + "\n");
}

async function rentcastSearch(params) {
  const url = new URL("https://api.rentcast.io/v1/listings/sale");
  Object.entries({ ...SHARED_PARAMS, ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { "X-Api-Key": RENTCAST_API_KEY, Accept: "application/json" } });
  if (!res.ok) throw new Error(`RentCast error ${res.status}: ${await res.text()}`);
  return res.json();
}

// A top-down photo of the actual lot, centred on the home. The game draws a
// marker over the middle of this image so players know which house is theirs.
function aerialImageUrl(lat, lng, propertyType) {
  const viewMeters = viewWidthMeters(propertyType);
  const heightMeters = viewMeters * (IMAGE_HEIGHT / IMAGE_WIDTH);
  const dLat = heightMeters / 111320;
  const dLng = viewMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lng - dLng / 2, lat - dLat / 2, lng + dLng / 2, lat + dLat / 2]
    .map(n => n.toFixed(6))
    .join(",");

  const url = new URL("https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage");
  url.searchParams.set("bbox", bbox);
  url.searchParams.set("bboxSR", "4326");
  url.searchParams.set("size", `${IMAGE_WIDTH},${IMAGE_HEIGHT}`);
  url.searchParams.set("format", "jpg");
  url.searchParams.set("f", "image");
  return url.toString();
}

/* ------------------------------------------------------------------ *
 * Street View coverage
 * ------------------------------------------------------------------ */

// Compass bearing (0 = north, 90 = east) from one point to another. Used to
// swing the Street View camera round until it's looking at the house rather
// than at whatever happened to be straight ahead when the car drove past.
function bearingDegrees(fromLat, fromLng, toLat, toLng) {
  const rad = d => (d * Math.PI) / 180;
  const lat1 = rad(fromLat);
  const lat2 = rad(toLat);
  const dLng = rad(toLng - fromLng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Straight-line distance in metres, near enough at these scales.
function metresBetween(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * 111320;
  const dLng = (lng2 - lng1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Ask Google whether anyone has ever driven past this address, and if so,
 * where they stood. Returns null for "no street coverage here".
 *
 * This hits the Street View *metadata* endpoint, which Google documents as
 * free of charge: it returns coordinates and a capture date, never an image.
 * That's what lets the refresh check hundreds of listings without a bill.
 */
// Flipped once Google answers with something that will be true for every
// subsequent request too — a key that isn't authorised, a quota that's gone.
// Without this, one bad key means thousands of identical doomed lookups.
let streetViewDisabled = false;

async function streetViewCamera(lat, lng) {
  if (streetViewDisabled) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(STREETVIEW_RADIUS_M));
  // Outdoor panoramas only — otherwise a shop's indoor virtual tour can win
  // the "nearest camera" contest and the player gets a photo of a lobby.
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("key", GOOGLE_MAPS_SERVER_KEY);

  let body;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    body = await res.json();
  } catch (e) {
    return null;
  }

  // ZERO_RESULTS is the normal "nobody has driven down this road" answer.
  // Anything else unexpected (a bad key, say) is worth shouting about once.
  if (body.status === "ZERO_RESULTS") return null;
  if (body.status !== "OK" || !body.location) {
    streetViewCamera.lastError = `${body.status}${body.error_message ? ": " + body.error_message : ""}`;
    // Not a "this road has no coverage" answer — it's a problem with the key
    // or the account, and it'll say the same thing every time. Stop asking.
    // Say so once, not once per request already in flight.
    if (!streetViewDisabled) {
      streetViewDisabled = true;
      console.warn(`  Street View lookups disabled for this run: ${streetViewCamera.lastError}`);
    }
    return null;
  }

  const camLat = body.location.lat;
  const camLng = body.location.lng;
  return {
    lat: Number(camLat.toFixed(6)),
    lng: Number(camLng.toFixed(6)),
    heading: Math.round(bearingDegrees(camLat, camLng, lat, lng)),
    metresAway: Math.round(metresBetween(camLat, camLng, lat, lng)),
    captured: body.date || null
  };
}

/**
 * Work through a shuffled pool of listings looking for ones with street
 * coverage, stopping as soon as `target` of them are found. Listings without
 * coverage aren't thrown away — they're kept back and used to top the pack
 * up if street coverage runs thin, so a pack is never short of homes.
 */
async function pickWithStreetView(pool, target) {
  const withView = [];
  const withoutView = [];
  let checked = 0;

  for (let i = 0; i < pool.length && withView.length < target && checked < STREETVIEW_MAX_LOOKUPS && !streetViewDisabled; i += STREETVIEW_CONCURRENCY) {
    const batch = pool.slice(i, i + STREETVIEW_CONCURRENCY);
    const cameras = await Promise.all(batch.map(l => streetViewCamera(l.latitude, l.longitude)));
    checked += batch.length;
    batch.forEach((listing, n) => {
      const camera = cameras[n];
      if (camera) withView.push({ listing, streetView: camera });
      else withoutView.push({ listing, streetView: null });
    });
  }

  // Anything never looked at (because we already had enough) is still a fine
  // fallback home, it just shows the aerial photo.
  const unchecked = pool.slice(checked).map(listing => ({ listing, streetView: null }));
  const chosen = withView.slice(0, target);
  const shortfall = target - chosen.length;
  if (shortfall > 0) chosen.push(...withoutView.concat(unchecked).slice(0, shortfall));

  return { chosen, checked, found: withView.length };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toGameShape(listing, id, streetView) {
  return {
    id,
    title: listing.propertyType ? `${listing.propertyType} in ${listing.city}` : `Home in ${listing.city}`,
    address: listing.addressLine1 || listing.formattedAddress || "",
    city: listing.city || "",
    state: listing.state || "",
    beds: listing.bedrooms ?? 0,
    baths: listing.bathrooms ?? 0,
    sqft: listing.squareFootage ?? 0,
    yearBuilt: listing.yearBuilt ?? null,
    lotSizeAcres: listing.lotSize ? Number((listing.lotSize / 43560).toFixed(2)) : 0,
    price: listing.price,
    latitude: listing.latitude,
    longitude: listing.longitude,
    // Where to stand and which way to look. Null means no street coverage,
    // and the game quietly shows the aerial photo instead.
    streetView: streetView || null,
    image: aerialImageUrl(listing.latitude, listing.longitude, listing.propertyType)
  };
}

async function buildPack(pack) {
  console.log(`Fetching pack "${pack.key}"...`);
  const results = await rentcastSearch(pack.rentcastParams);
  const [minPrice, maxPrice] = pack.priceRange;

  const seenSpots = new Set();
  const usable = results.filter(l => {
    // Belt-and-braces price check in case a server-side filter is ever ignored.
    if (!l.price || l.price < minPrice || l.price > maxPrice) return false;

    // No coordinates means no aerial photo of the place.
    if (typeof l.latitude !== "number" || typeof l.longitude !== "number") return false;

    // Vacant land is unguessable in a game about pricing homes: no beds, no
    // baths, no floor area, and an aerial photo of an empty field.
    if (EXCLUDED_TYPES.includes(l.propertyType)) return false;

    // Every listing needs at least one hard number to reason from.
    if (!l.squareFootage && !l.bedrooms) return false;

    // One listing per spot. Condo towers return many units at identical
    // coordinates, which would otherwise show the same photo twice in a run
    // with two different "right" answers.
    const spot = `${l.latitude.toFixed(5)},${l.longitude.toFixed(5)}`;
    if (seenSpots.has(spot)) return false;
    seenSpots.add(spot);
    return true;
  });

  if (usable.length === 0) {
    console.warn(`  No listings matched pack "${pack.key}" — keeping existing file untouched.`);
    return;
  }

  // Shuffle before slicing so each run surfaces a different set of homes
  // instead of always the most recently seen ones.
  const pool = shuffle(usable);

  let selection;
  if (GOOGLE_MAPS_SERVER_KEY && !streetViewDisabled) {
    const { chosen, checked, found } = await pickWithStreetView(pool, LISTINGS_PER_PACK);
    selection = chosen;
    console.log(`  Street view: ${found} of ${checked} addresses checked had coverage.`);
  } else {
    selection = pool.slice(0, LISTINGS_PER_PACK).map(listing => ({ listing, streetView: null }));
  }

  const properties = selection.map(({ listing, streetView }, i) =>
    toGameShape(listing, `${pack.key}-${String(i + 1).padStart(3, "0")}`, streetView)
  );

  const withStreetView = properties.filter(p => p.streetView).length;

  const outPath = path.join(DATA_DIR, pack.outFile);
  const payload = {
    pack: pack.key,
    label: pack.label,
    source: "rentcast",
    imagery: "Google Street View (via player's own browser key) with USGS National Map aerial fallback (public domain)",
    streetViewCoverage: `${withStreetView}/${properties.length}`,
    fetchedAt: new Date().toISOString(),
    properties
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(
    `  Wrote ${properties.length} listings (of ${usable.length} matches) to ${outPath}` +
    ` — ${withStreetView} with street view, ${properties.length - withStreetView} aerial-only.`
  );
}

async function main() {
  if (!RENTCAST_API_KEY) {
    console.error("Missing RENTCAST_API_KEY environment variable. Nothing to do.");
    process.exit(1);
  }

  if (GOOGLE_MAPS_SERVER_KEY) {
    console.log("Street View metadata lookups enabled (free of charge — no imagery is requested here).");
  } else {
    console.log(
      "No GOOGLE_MAPS_SERVER_KEY set — every listing will fall back to the USGS aerial photo.\n" +
      "See README step 3 to switch street views on."
    );
  }

  const usage = readUsage();
  console.log(`RentCast calls used so far in ${usage.month}: ${usage.calls}/${MONTHLY_CALL_BUDGET}`);

  for (const pack of PACKS) {
    if (usage.calls >= MONTHLY_CALL_BUDGET) {
      console.warn(
        `Monthly budget of ${MONTHLY_CALL_BUDGET} calls reached — skipping "${pack.key}" ` +
        `and any packs after it. Existing listings are left untouched.`
      );
      break;
    }
    // Count the call before making it: if the request dies halfway we'd rather
    // over-count than drift under the real usage this guard exists to cap.
    usage.calls += 1;
    writeUsage(usage);

    try {
      await buildPack(pack);
    } catch (err) {
      console.error(`Failed to refresh pack "${pack.key}":`, err.message);
    }
  }

  console.log(`RentCast calls used this month: ${usage.calls}/${MONTHLY_CALL_BUDGET}`);

  // A bad or unauthorised Google key looks exactly like "nowhere has street
  // coverage", which is a miserable thing to debug. Say it plainly instead.
  if (streetViewCamera.lastError) {
    console.warn(
      `\nGoogle rejected the Street View metadata lookups: ${streetViewCamera.lastError}\n` +
      "Listings fell back to aerial photos. Check that GOOGLE_MAPS_SERVER_KEY is valid, that\n" +
      "the Street View Static API is enabled for it, and that it is NOT restricted to an HTTP\n" +
      "referrer (this script runs on a server, so it sends none)."
    );
  }
}

main();
