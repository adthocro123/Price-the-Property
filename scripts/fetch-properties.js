#!/usr/bin/env node
/**
 * fetch-properties.js
 * -----------------------------------------------------------------------
 * Pulls real listings from the RentCast API and a real street-facing photo
 * from Google's Street View Static API, then writes them into the static
 * JSON files the game reads (data/properties-*.json).
 *
 * This script is meant to run in GitHub Actions (see
 * .github/workflows/refresh-data.yml), NOT in the browser — that's what
 * keeps your API keys private. It reads them from environment variables,
 * which the workflow populates from GitHub repo secrets.
 *
 * Required environment variables:
 *   RENTCAST_API_KEY   - from https://www.rentcast.io/api
 *   GOOGLE_MAPS_API_KEY - a Google Cloud API key with the "Street View
 *                         Static API" enabled (billing must be on, but
 *                         Google gives a monthly free credit)
 *
 * Run locally to test (never commit your real keys):
 *   RENTCAST_API_KEY=xxx GOOGLE_MAPS_API_KEY=yyy node scripts/fetch-properties.js
 * -----------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const RENTCAST_API_KEY = process.env.RENTCAST_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const DATA_DIR = path.join(__dirname, "..", "data");

// One config entry per pack this script can refresh. Tune the RentCast
// query params to change what shows up in each pack.
const PACKS = [
  {
    key: "standard",
    outFile: "properties-standard.json",
    label: "Starter Homes",
    count: 15,
    rentcastParams: { limit: "50", status: "Active" }, // add city/state filters as you like
    priceRange: [150000, 650000]
  },
  {
    key: "mansion",
    outFile: "properties-mansion.json",
    label: "Mansion Expansion",
    count: 10,
    rentcastParams: { limit: "50", status: "Active" },
    priceRange: [3000000, 30000000]
  },
  {
    key: "hawaii",
    outFile: "properties-hawaii.json",
    label: "Hawaii Expansion",
    count: 10,
    rentcastParams: { limit: "50", status: "Active", state: "HI" },
    priceRange: [400000, 10000000]
  }
];

async function rentcastSearch(params) {
  const url = new URL("https://api.rentcast.io/v1/listings/sale");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { "X-Api-Key": RENTCAST_API_KEY, Accept: "application/json" } });
  if (!res.ok) throw new Error(`RentCast error ${res.status}: ${await res.text()}`);
  return res.json();
}

function streetViewUrl(lat, lng) {
  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", "900x600");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("fov", "80");
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);
  return url.toString();
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
    image: listing.latitude && listing.longitude
      ? streetViewUrl(listing.latitude, listing.longitude)
      : `https://picsum.photos/seed/${id}/900/600`
  };
}

async function buildPack(pack) {
  console.log(`Fetching pack "${pack.key}"...`);
  const results = await rentcastSearch(pack.rentcastParams);
  const [minPrice, maxPrice] = pack.priceRange;
  const filtered = results
    .filter(l => l.price && l.price >= minPrice && l.price <= maxPrice)
    .slice(0, pack.count);

  if (filtered.length === 0) {
    console.warn(`  No listings matched pack "${pack.key}" — keeping existing file untouched.`);
    return;
  }

  const properties = filtered.map((l, i) => toGameShape(l, `${pack.key}-${String(i + 1).padStart(3, "0")}`));
  const outPath = path.join(DATA_DIR, pack.outFile);
  const payload = {
    pack: pack.key,
    label: pack.label,
    source: "rentcast",
    fetchedAt: new Date().toISOString(),
    properties
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`  Wrote ${properties.length} listings to ${outPath}`);
}

async function main() {
  if (!RENTCAST_API_KEY) {
    console.error("Missing RENTCAST_API_KEY environment variable. Nothing to do.");
    process.exit(1);
  }
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("No GOOGLE_MAPS_API_KEY set — listings will fall back to placeholder photos.");
  }
  for (const pack of PACKS) {
    try {
      await buildPack(pack);
    } catch (err) {
      console.error(`Failed to refresh pack "${pack.key}":`, err.message);
    }
  }
}

main();
