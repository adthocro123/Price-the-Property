#!/usr/bin/env node
/**
 * fetch-properties.js
 * -----------------------------------------------------------------------
 * Pulls real, currently-listed homes from the RentCast API and pairs each
 * one with a real aerial photo of that exact address from the USGS National
 * Map imagery service, then writes them into the static JSON files the game
 * reads (data/properties-*.json).
 *
 * Why USGS for the photos: it's public domain US government imagery, free
 * forever, and needs no API key and no billing account — so nothing secret
 * ends up in the committed data files or in the browser. (Google Street View
 * would need a credit card on file, and its key would be visible inside every
 * committed image URL.)
 *
 * This script is meant to run in GitHub Actions (see
 * .github/workflows/refresh-data.yml), NOT in the browser — that's what
 * keeps your RentCast key private. It reads it from an environment
 * variable, which the workflow populates from a GitHub repo secret.
 *
 * Required environment variables:
 *   RENTCAST_API_KEY - from https://www.rentcast.io/api
 *
 * Run locally to test (never commit your real key):
 *   RENTCAST_API_KEY=xxx node scripts/fetch-properties.js
 * -----------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const RENTCAST_API_KEY = process.env.RENTCAST_API_KEY;
const DATA_DIR = path.join(__dirname, "..", "data");

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

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toGameShape(listing, id) {
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
  const properties = shuffle(usable)
    .slice(0, LISTINGS_PER_PACK)
    .map((l, i) => toGameShape(l, `${pack.key}-${String(i + 1).padStart(3, "0")}`));

  const outPath = path.join(DATA_DIR, pack.outFile);
  const payload = {
    pack: pack.key,
    label: pack.label,
    source: "rentcast",
    imagery: "USGS National Map (public domain)",
    fetchedAt: new Date().toISOString(),
    properties
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`  Wrote ${properties.length} listings (of ${usable.length} matches) to ${outPath}`);
}

async function main() {
  if (!RENTCAST_API_KEY) {
    console.error("Missing RENTCAST_API_KEY environment variable. Nothing to do.");
    process.exit(1);
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
}

main();
