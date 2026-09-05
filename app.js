/* =========================================================================
   PRICE THE PROPERTY — game logic
   -------------------------------------------------------------------------
   HOW TO CONNECT REAL STRIPE PAYMENT LINKS:
   1. In your Stripe Dashboard, create a Payment Link for each product below
      (three $4.99 one-time DLCs + one recurring monthly subscription).
   2. For each Payment Link, under "After payment" choose "Don't show
      confirmation page" and set the redirect URL to your site with a
      matching `?unlocked=` param, e.g.
        https://adthocro123.github.io/Price-the-Property/?unlocked=mansion
        https://adthocro123.github.io/Price-the-Property/?unlocked=hawaii
        https://adthocro123.github.io/Price-the-Property/?unlocked=car
        https://adthocro123.github.io/Price-the-Property/?unlocked=pro
   3. Paste each Payment Link URL into the `stripeLink` fields below.
   That's it — no backend needed. See README.md for the full walkthrough
   (this is a client-side "trust the redirect" unlock, good enough for a
   solo/small launch — see README for how to harden it later).
   ========================================================================= */

const CONFIG = {
  siteUrl: "https://adthocro123.github.io/Price-the-Property/",
  roundsPerShowcase: 5,
  packs: {
    standard: {
      key: "standard", name: "Starter Homes", emoji: "🏠",
      file: "data/properties-standard.json", itemsKey: "properties", type: "property",
      free: true, maxGuess: 1200000, desc: "Everyday homes from coast to coast"
    },
    mansion: {
      key: "mansion", name: "Mansion Expansion", emoji: "🏰",
      file: "data/properties-mansion.json", itemsKey: "properties", type: "property",
      free: false, price: "$4.99 one-time", maxGuess: 30000000,
      stripeLink: "https://buy.stripe.com/REPLACE_MANSION",
      desc: "Multi-million dollar estates & celebrity-tier homes"
    },
    hawaii: {
      key: "hawaii", name: "Hawaii Expansion", emoji: "🌺",
      file: "data/properties-hawaii.json", itemsKey: "properties", type: "property",
      free: false, price: "$4.99 one-time", maxGuess: 8000000,
      stripeLink: "https://buy.stripe.com/REPLACE_HAWAII",
      desc: "Island getaways from Kailua to Kauai"
    },
    fixer: {
      key: "fixer", name: "Fixer-Uppers", emoji: "🔨",
      file: "data/properties-fixer.json", itemsKey: "properties", type: "property",
      free: true, maxGuess: 400000,
      desc: "Bargain-bin homes that need some love"
    },
    car: {
      key: "car", name: "Car Expansion", emoji: "🚗",
      file: "data/vehicles-car.json", itemsKey: "vehicles", type: "vehicle",
      free: false, price: "$4.99 one-time", maxGuess: 100000,
      stripeLink: "https://buy.stripe.com/REPLACE_CAR",
      desc: "Guess the price of real used cars & trucks"
    },
    nyc: {
      key: "nyc", name: "Big Apple", emoji: "🗽",
      file: "data/properties-nyc.json", itemsKey: "properties", type: "property",
      free: false, price: "$4.99 one-time", maxGuess: 15000000,
      stripeLink: "https://buy.stripe.com/REPLACE_NYC",
      desc: "New York City, where closets cost a fortune"
    },
    colorado: {
      key: "colorado", name: "Colorado Collection", emoji: "🏔️",
      file: "data/properties-colorado.json", itemsKey: "properties", type: "property",
      free: false, price: "$4.99 one-time", maxGuess: 10000000,
      stripeLink: "https://buy.stripe.com/REPLACE_COLORADO",
      desc: "Mountain towns, ski chalets & Front Range sprawl"
    },
    newbuild: {
      key: "newbuild", name: "Brand New Builds", emoji: "🏗️",
      file: "data/properties-newbuild.json", itemsKey: "properties", type: "property",
      free: false, price: "$4.99 one-time", maxGuess: 2000000,
      stripeLink: "https://buy.stripe.com/REPLACE_NEWBUILD",
      desc: "Built in the last few years — still smells new"
    },
    historic: {
      key: "historic", name: "Historic Homes", emoji: "🏛️",
      file: "data/properties-historic.json", itemsKey: "properties", type: "property",
      free: false, price: "$4.99 one-time", maxGuess: 3000000,
      stripeLink: "https://buy.stripe.com/REPLACE_HISTORIC",
      desc: "Pre-1940 character, wiring not included"
    }
  },
  subscription: {
    key: "pro", name: "Property Pro Monthly", emoji: "👑",
    price: "$3.99/mo", desc: "Unlocks every expansion + a daily coin bonus",
    stripeLink: "https://buy.stripe.com/REPLACE_PRO"
  }
};

const SAVE_KEY = "ptp_save_v1";
const HINT_COST = 50;

let state = {
  coins: 0,
  streak: 0,
  bestScore: 0,
  gamesPlayed: 0,
  bullseyes: 0,
  unlocked: { mansion: false, hawaii: false, car: false, pro: false },
  selectedPack: "standard",
  roundIndex: 0,
  roundItems: [],
  showcaseScore: 0,
  showcaseGrid: [],
  isDaily: false,
  hintUsedThisRound: false,
  dataCache: {}
};

/* ---------------------------- persistence ---------------------------- */
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.coins = parsed.coins || 0;
      state.streak = parsed.streak || 0;
      state.bestScore = parsed.bestScore || 0;
      state.gamesPlayed = parsed.gamesPlayed || 0;
      state.bullseyes = parsed.bullseyes || 0;
      state.unlocked = Object.assign({ mansion: false, hawaii: false, car: false, pro: false }, parsed.unlocked || {});
    }
  } catch (e) { /* ignore corrupt save */ }
}
function persistSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      coins: state.coins, streak: state.streak, bestScore: state.bestScore,
      gamesPlayed: state.gamesPlayed, bullseyes: state.bullseyes, unlocked: state.unlocked
    }));
  } catch (e) { /* storage unavailable — game still works in-memory */ }
}

/* ------------------------ unlock via redirect ------------------------- */
function checkUnlockRedirect() {
  const params = new URLSearchParams(window.location.search);
  const unlocked = params.get("unlocked");
  if (unlocked) {
    if (unlocked === "pro") {
      state.unlocked.pro = true;
      state.unlocked.mansion = true;
      state.unlocked.hawaii = true;
      state.unlocked.car = true;
      showToast("👑 Property Pro unlocked! All packs are open.");
    } else if (CONFIG.packs[unlocked]) {
      state.unlocked[unlocked] = true;
      showToast(`🎉 ${CONFIG.packs[unlocked].name} unlocked!`);
    }
    persistSave();
    params.delete("unlocked");
    const clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", clean);
  }
}

function isPackUnlocked(key) {
  const pack = CONFIG.packs[key];
  if (!pack) return false;
  if (pack.free) return true;
  return !!state.unlocked[key] || !!state.unlocked.pro;
}

/* ------------------------------- toasts -------------------------------- */
function showToast(msg) {
  const stack = document.getElementById("toast-stack");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ------------------------------ screens -------------------------------- */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  const tabBar = document.getElementById("tab-bar");
  const showTabs = id === "screen-home" || id === "screen-store";
  tabBar.classList.toggle("visible", showTabs);
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  if (id === "screen-home") document.getElementById("tab-home").classList.add("active");
  if (id === "screen-store") document.getElementById("tab-packs").classList.add("active");

  window.scrollTo(0, 0);
}

/* ------------------------------- data ----------------------------------*/
async function fetchPackData(key) {
  if (state.dataCache[key]) return state.dataCache[key];
  const pack = CONFIG.packs[key];
  let items = [];
  try {
    const res = await fetch(pack.file);
    // A newly added pack has no data file until the refresh workflow runs —
    // treat that as an empty pack rather than breaking the whole showcase.
    if (res.ok) {
      const json = await res.json();
      items = json[pack.itemsKey] || [];
    }
  } catch (e) { /* offline or malformed — same as empty */ }
  state.dataCache[key] = items;
  return items;
}

/* ------------------------------ formatting ------------------------------*/
function formatCompactUSD(n) {
  const abs = Math.abs(n);
  if (abs >= 1000000) return "$" + (abs / 1000000).toFixed(abs % 1000000 === 0 ? 0 : 1) + "M";
  if (abs >= 1000) return "$" + Math.round(abs / 1000) + "K";
  return "$" + abs;
}
function quickAdjustAmounts(maxGuess) {
  if (maxGuess <= 150000) return [-5000, -1000, 1000, 5000];
  if (maxGuess <= 1500000) return [-50000, -10000, 10000, 50000];
  if (maxGuess <= 10000000) return [-250000, -50000, 50000, 250000];
  return [-1000000, -250000, 250000, 1000000];
}

/* ---------------------------- home screen ------------------------------*/
function renderHome() {
  document.getElementById("stat-coins").textContent = state.coins.toLocaleString();
  document.getElementById("stat-streak").textContent = state.streak;
  document.getElementById("stat-best").textContent = state.bestScore.toLocaleString();
  document.getElementById("stat-games").textContent = state.gamesPlayed;
  document.getElementById("stat-bullseyes").textContent = state.bullseyes;

  const selectedPack = CONFIG.packs[state.selectedPack];
  document.getElementById("hero-pack-badge").textContent = `${selectedPack.emoji} ${selectedPack.name}`;

  const grid = document.getElementById("pack-grid");
  grid.innerHTML = "";
  Object.values(CONFIG.packs).forEach(pack => {
    const unlocked = isPackUnlocked(pack.key);
    const selected = state.selectedPack === pack.key;
    const card = document.createElement("div");
    card.className = "pack-photo-card" + (selected ? " selected" : "");
    card.style.backgroundImage = `url('https://picsum.photos/seed/ptp-pack-${pack.key}/600/480')`;
    card.innerHTML = `
      <div class="pack-photo-overlay"></div>
      <div class="pack-photo-top">
        ${!unlocked ? `<span class="pack-badge-lock">🔒 Expansion</span><span class="pack-badge-price">${pack.price || ""}</span>` : (selected ? `<span class="pack-badge-selected">✓ Selected</span>` : `<span></span>`)}
      </div>
      <div class="pack-photo-bottom">
        <div class="pack-photo-name">${pack.emoji} ${pack.name}</div>
        <div class="pack-photo-desc">${pack.desc || ""}</div>
      </div>
    `;
    card.addEventListener("click", () => {
      if (!unlocked) { renderStore(); showScreen("screen-store"); return; }
      state.selectedPack = pack.key;
      renderHome();
    });
    grid.appendChild(card);
  });
}

/* ---------------------------- store screen -----------------------------*/
function renderStore() {
  const list = document.getElementById("store-list");
  list.innerHTML = "";

  Object.values(CONFIG.packs).filter(p => !p.free).forEach(pack => {
    const owned = isPackUnlocked(pack.key);
    const row = document.createElement("div");
    row.className = "store-item" + (owned ? " owned" : "");
    row.innerHTML = `
      <div class="store-item-emoji">${pack.emoji}</div>
      <div class="store-item-body">
        <div class="store-item-title">${pack.name}</div>
        <div class="store-item-desc">${pack.desc || ""}</div>
        <div class="store-item-price">${owned ? "✅ Owned" : pack.price}</div>
      </div>
      <button class="store-item-btn ${owned ? "owned-btn" : ""}" ${owned ? "disabled" : ""}>${owned ? "Owned" : "Unlock"}</button>
    `;
    if (!owned) {
      row.querySelector("button").addEventListener("click", () => goToCheckout(pack.stripeLink, pack.name, pack.key));
    }
    list.appendChild(row);
  });

  const sub = CONFIG.subscription;
  const subOwned = state.unlocked.pro;
  const subRow = document.createElement("div");
  subRow.className = "store-item featured" + (subOwned ? " owned" : "");
  subRow.innerHTML = `
    <div class="store-item-emoji">${sub.emoji}</div>
    <div class="store-item-body">
      <div class="store-item-title">${sub.name}</div>
      <div class="store-item-desc">${sub.desc}</div>
      <div class="store-item-price">${subOwned ? "✅ Active" : sub.price}</div>
    </div>
    <button class="store-item-btn ${subOwned ? "owned-btn" : ""}" ${subOwned ? "disabled" : ""}>${subOwned ? "Active" : "Subscribe"}</button>
  `;
  if (!subOwned) {
    subRow.querySelector("button").addEventListener("click", () => goToCheckout(sub.stripeLink, sub.name, sub.key));
  }
  list.appendChild(subRow);
}

function goToCheckout(link, name, unlockKey) {
  if (!link || link.includes("REPLACE")) {
    // No real Stripe Payment Link configured yet — grant a free test unlock
    // instead, so the game is fully playable while payments aren't wired up.
    // Once you paste a real stripeLink into CONFIG, this branch stops
    // triggering and the button sends players to real Stripe checkout.
    if (unlockKey === "pro") {
      state.unlocked.pro = true;
      state.unlocked.mansion = true;
      state.unlocked.hawaii = true;
      state.unlocked.car = true;
    } else {
      state.unlocked[unlockKey] = true;
    }
    persistSave();
    showToast(`🧪 Test unlock: "${name}" is open for free. Add a real Stripe Payment Link in app.js before launch.`);
    renderStore();
    renderHome();
    return;
  }
  window.location.href = link;
}

/* ----------------------------- game flow -------------------------------*/
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; }
  return h;
}
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor((rng ? rng() : Math.random()) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function startGame(isDaily) {
  state.isDaily = !!isDaily;
  state.roundIndex = 0;
  state.showcaseScore = 0;
  state.showcaseGrid = [];
  closeResultModal();

  let pool = [];
  if (isDaily) {
    const unlockedKeys = Object.keys(CONFIG.packs).filter(isPackUnlocked);
    const rng = mulberry32(hashStr(new Date().toISOString().slice(0, 10)));
    for (const key of unlockedKeys) {
      const items = await fetchPackData(key);
      items.forEach(it => pool.push({ item: it, packKey: key }));
    }
    pool = shuffle(pool, rng).slice(0, CONFIG.roundsPerShowcase);
  } else {
    const items = await fetchPackData(state.selectedPack);
    pool = shuffle(items).slice(0, CONFIG.roundsPerShowcase).map(it => ({ item: it, packKey: state.selectedPack }));
  }

  if (pool.length === 0) {
    showToast(isDaily
      ? "No listings available yet — try again after the next data refresh."
      : `${CONFIG.packs[state.selectedPack].name} is waiting on its first data refresh.`);
    return;
  }

  state.roundItems = pool;
  showScreen("screen-game");
  loadRound();
}

function currentRound() { return state.roundItems[state.roundIndex]; }

function updateSliderFill(slider) {
  const pct = (slider.value - slider.min) / (slider.max - slider.min) * 100;
  slider.style.background = `linear-gradient(to right, var(--green) 0%, var(--green) ${pct}%, var(--card-alt) ${pct}%, var(--card-alt) 100%)`;
}

function setGuessValue(v, slider) {
  const min = parseInt(slider.min, 10);
  const clamped = Math.max(min, Math.min(v, parseInt(slider.max, 10)));
  slider.value = clamped;
  document.getElementById("guess-input").value = clamped.toLocaleString();
  updateSliderFill(slider);
}

// Keeps the big number readable as "1,250,000" while typing, without the
// caret jumping to the end every time a comma is inserted or removed.
function reformatGuessInput(el) {
  const digitsBeforeCaret = el.value.slice(0, el.selectionStart).replace(/[^0-9]/g, "").length;
  const digits = el.value.replace(/[^0-9]/g, "");
  el.value = digits ? Number(digits).toLocaleString() : "";

  let pos = 0;
  for (let seen = 0; pos < el.value.length && seen < digitsBeforeCaret; pos++) {
    if (el.value[pos] >= "0" && el.value[pos] <= "9") seen++;
  }
  el.setSelectionRange(pos, pos);
  return digits;
}

function renderQuickAdjust(maxGuess) {
  const wrap = document.getElementById("quick-adjust");
  wrap.innerHTML = "";
  quickAdjustAmounts(maxGuess).forEach(delta => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-adjust-btn";
    btn.textContent = (delta < 0 ? "−" : "+") + formatCompactUSD(delta);
    btn.addEventListener("click", () => {
      const slider = document.getElementById("guess-slider");
      setGuessValue(currentGuessValue() + delta, slider);
    });
    wrap.appendChild(btn);
  });
}

function loadRound() {
  const round = currentRound();
  const pack = CONFIG.packs[round.packKey];
  const item = round.item;

  document.getElementById("round-title-main").textContent = state.isDaily ? "Daily Challenge" : pack.name;
  document.getElementById("round-indicator").textContent = `Round ${state.roundIndex + 1} of ${state.roundItems.length}`;
  document.getElementById("game-coins").textContent = state.coins.toLocaleString();

  const dotsWrap = document.getElementById("round-dots");
  dotsWrap.innerHTML = "";
  state.roundItems.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.className = "round-dot" + (i < state.roundIndex ? " done" : "") + (i === state.roundIndex ? " current" : "");
    dotsWrap.appendChild(dot);
  });

  const imgEl = document.getElementById("property-image");
  imgEl.alt = item.title;
  imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#f2e6da"/><text x="450" y="300" font-family="sans-serif" font-size="28" fill="#c9a98a" text-anchor="middle">Photo unavailable</text></svg>'
  ); };
  imgEl.src = item.image;
  document.getElementById("property-pack-badge").textContent = pack.emoji + " " + pack.name;
  document.getElementById("property-title").textContent = item.title;

  // Aerial photos are centred on the listed home, so show the reticle that
  // tells players which house they're pricing. Vehicles use plain photos.
  const isAerial = typeof item.latitude === "number" && typeof item.longitude === "number";
  document.getElementById("property-pin").hidden = !isAerial;
  document.getElementById("image-note").hidden = !isAerial;

  // Real listing data has gaps that the demo data never did, so drop any
  // detail that came back empty rather than rendering "Built null".
  let primaryChips, secondaryChips, subtitle;
  if (pack.type === "vehicle") {
    subtitle = `${item.year} • ${item.condition}`;
    primaryChips = [item.make, item.model, `${item.mileage.toLocaleString()} mi`];
    secondaryChips = [];
  } else {
    subtitle = `${item.city}, ${item.state}`;
    primaryChips = [
      item.beds ? `${item.beds} bd` : null,
      item.baths ? `${item.baths} ba` : null,
      item.sqft ? `${item.sqft.toLocaleString()} sqft` : null
    ].filter(Boolean);
    secondaryChips = [
      item.yearBuilt ? `Built ${item.yearBuilt}` : null,
      item.lotSizeAcres ? `${item.lotSizeAcres} ac lot` : null
    ].filter(Boolean);
  }
  document.getElementById("property-address").textContent = subtitle;
  document.getElementById("detail-line").textContent = primaryChips.join(" • ");
  const secondaryLine = document.getElementById("detail-line-secondary");
  const divider = document.getElementById("detail-divider");
  secondaryLine.textContent = secondaryChips.join(" • ");
  divider.style.display = secondaryChips.length ? "" : "none";

  // The USGS imagery server can take a beat, so warm the next round's photo
  // while this one is being played.
  const next = state.roundItems[state.roundIndex + 1];
  if (next) new Image().src = next.item.image;

  const slider = document.getElementById("guess-slider");
  slider.min = 0;
  slider.max = pack.maxGuess;
  slider.step = pack.maxGuess > 2000000 ? 10000 : (pack.maxGuess > 200000 ? 1000 : 250);
  setGuessValue(Math.round(pack.maxGuess / 2), slider);
  document.getElementById("slider-min-label").textContent = formatCompactUSD(0);
  document.getElementById("slider-max-label").textContent = formatCompactUSD(pack.maxGuess);
  renderQuickAdjust(pack.maxGuess);

  state.hintUsedThisRound = false;
  const hintBtn = document.getElementById("btn-hint");
  hintBtn.disabled = false;
  hintBtn.textContent = `💡 Hint — ${HINT_COST} coins`;
}

function useHint() {
  if (state.hintUsedThisRound) { showToast("💡 You've already used a hint this round."); return; }
  if (state.coins < HINT_COST) {
    showToast(`💡 A hint costs ${HINT_COST} coins — you have ${state.coins}.`);
    return;
  }

  const round = currentRound();
  const actual = round.item.price;
  const maxGuess = CONFIG.packs[round.packKey].maxGuess;

  // Narrow to a band that definitely contains the price but isn't centred on
  // it, so a hint is a real help without simply handing over the answer.
  const span = Math.round(actual * 0.5);
  const lo = Math.max(0, Math.round(actual - Math.random() * span));
  const hi = Math.min(maxGuess, lo + span);

  state.coins -= HINT_COST;
  state.hintUsedThisRound = true;
  persistSave();

  const slider = document.getElementById("guess-slider");
  slider.min = lo;
  slider.max = hi;
  document.getElementById("slider-min-label").textContent = formatCompactUSD(lo);
  document.getElementById("slider-max-label").textContent = formatCompactUSD(hi);
  setGuessValue(Math.round((lo + hi) / 2), slider);

  document.getElementById("game-coins").textContent = state.coins.toLocaleString();
  const btn = document.getElementById("btn-hint");
  btn.disabled = true;
  btn.textContent = "💡 Hint used — half points this round";
  showToast(`💡 Somewhere between ${formatCompactUSD(lo)} and ${formatCompactUSD(hi)}.`);
}

function currentGuessValue() {
  const raw = document.getElementById("guess-input").value;
  const n = parseInt(String(raw).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? parseInt(document.getElementById("guess-slider").value, 10) : n;
}

function openResultModal() { document.getElementById("result-modal").classList.add("open"); }
function closeResultModal() { document.getElementById("result-modal").classList.remove("open"); }

function submitGuess() {
  const round = currentRound();
  const item = round.item;
  const guess = currentGuessValue();
  const actual = item.price;

  let pts, over;
  if (guess > actual) {
    pts = 0; over = true;
    state.streak = 0;
  } else {
    over = false;
    const pctOff = (actual - guess) / actual;
    pts = Math.max(0, Math.round(1000 * (1 - pctOff * 5)));
    if (guess === actual) pts = 1200;
    state.streak += 1;
  }
  if (state.hintUsedThisRound) pts = Math.round(pts / 2);
  const coinsEarned = Math.round(pts / 20) + (state.streak > 0 && state.streak % 3 === 0 ? 15 : 0);
  state.coins += coinsEarned;
  state.showcaseScore += pts;
  if (!over && pts >= 900) state.bullseyes += 1;

  let gridEmoji = "🟥";
  if (!over) {
    if (pts >= 900) gridEmoji = "🟩";
    else if (pts >= 500) gridEmoji = "🟨";
    else gridEmoji = "🟧";
  }
  state.showcaseGrid.push(gridEmoji);
  persistSave();

  const tier = over ? "over" : (pts >= 900 ? "great" : pts >= 500 ? "good" : "ok");
  document.getElementById("result-card").className = "result-card result-" + tier;
  document.getElementById("result-badge").textContent = over ? "😬" : (pts >= 900 ? "🎯" : pts >= 500 ? "🎉" : "👍");
  document.getElementById("result-heading").textContent = over
    ? "Over budget!"
    : (pts >= 900 ? "Bullseye!" : pts >= 500 ? "Nice guess!" : "Not bad!");
  document.getElementById("result-subtext").textContent = over
    ? "You went over — that's $0 for this one."
    : `You were within ${Math.round(Math.abs(actual - guess) / actual * 100)}% of the actual price.`;
  document.getElementById("result-your-guess").textContent = "$" + guess.toLocaleString();
  document.getElementById("result-actual-price").textContent = "$" + actual.toLocaleString();
  document.getElementById("result-points").textContent = pts.toLocaleString();
  document.getElementById("result-coins").textContent = coinsEarned;
  document.getElementById("btn-next-round").textContent =
    (state.roundIndex + 1 >= state.roundItems.length ? "See My Results →" : "Next Property →");

  if (navigator.vibrate) navigator.vibrate(over ? 80 : [40, 30, 40]);
  openResultModal();
}

function nextRound() {
  closeResultModal();
  state.roundIndex += 1;
  if (state.roundIndex >= state.roundItems.length) {
    showSummary();
  } else {
    loadRound();
    showScreen("screen-game");
  }
}

function starsForScore(score, rounds) {
  const maxPossible = rounds * 1200;
  const pct = maxPossible > 0 ? score / maxPossible : 0;
  return Math.max(1, Math.min(5, Math.round(pct * 5)));
}

function showSummary() {
  const isNewBest = state.showcaseScore > state.bestScore;
  if (isNewBest) state.bestScore = state.showcaseScore;
  state.gamesPlayed += 1;
  persistSave();

  const stars = starsForScore(state.showcaseScore, state.roundItems.length);
  const tiers = [
    { min: 5, emoji: "🏆", heading: "Open-house oracle!", sub: "Today's homes didn't stand a chance." },
    { min: 4, emoji: "🌟", heading: "Sharp eye for value!", sub: "You're closer than most agents." },
    { min: 3, emoji: "🏡", heading: "Solid showing!", sub: "You know your way around a listing." },
    { min: 2, emoji: "🤔", heading: "Room to grow!", sub: "The market's tricky — try again." },
    { min: 1, emoji: "😅", heading: "Tough round!", sub: "Every showcase is a learning curve." }
  ];
  const tier = tiers.find(t => stars >= t.min) || tiers[tiers.length - 1];

  document.getElementById("summary-emoji").textContent = tier.emoji;
  document.getElementById("summary-heading").textContent = state.isDaily ? "Daily Challenge Complete!" : tier.heading;
  document.getElementById("summary-score").textContent = state.showcaseScore.toLocaleString();
  document.getElementById("summary-stars").textContent = "★".repeat(stars) + "☆".repeat(5 - stars);
  document.getElementById("summary-subtext").textContent = isNewBest
    ? "🎉 New personal best!"
    : (state.isDaily ? tier.sub : `Personal best: ${state.bestScore.toLocaleString()} pts`);

  const dateLabel = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const shareText = `Price the Property ${state.isDaily ? "Daily " : ""}${dateLabel}\n${state.showcaseGrid.join(" ")}\n${state.showcaseScore} pts — can you beat me? ${CONFIG.siteUrl}`;
  document.getElementById("summary-share-box").textContent = state.showcaseGrid.length ? shareText : "";
  document.getElementById("summary-share-box").dataset.shareText = shareText;

  showScreen("screen-summary");
  renderHome();
}

function shareResult() {
  const text = document.getElementById("summary-share-box").dataset.shareText || "";
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast("📋 Copied to clipboard!"));
  } else {
    showToast("Copy your score from the box above!");
  }
}

/* ------------------------------- wiring --------------------------------*/
function wireEvents() {
  document.getElementById("btn-play").addEventListener("click", () => startGame(false));
  document.getElementById("btn-daily").addEventListener("click", () => startGame(true));
  document.getElementById("btn-store").addEventListener("click", () => { renderStore(); showScreen("screen-store"); });
  document.getElementById("btn-store-exit").addEventListener("click", () => { renderHome(); showScreen("screen-home"); });
  document.getElementById("btn-summary-store").addEventListener("click", () => { renderStore(); showScreen("screen-store"); });
  document.getElementById("btn-summary-home").addEventListener("click", () => { renderHome(); showScreen("screen-home"); });

  document.getElementById("tab-home").addEventListener("click", () => { renderHome(); showScreen("screen-home"); });
  document.getElementById("tab-play").addEventListener("click", () => startGame(false));
  document.getElementById("tab-packs").addEventListener("click", () => { renderStore(); showScreen("screen-store"); });
  document.getElementById("tab-me").addEventListener("click", () => showToast("🙂 Profile & achievements coming soon — check your stats above!"));

  document.getElementById("btn-game-exit").addEventListener("click", () => {
    if (confirm("Leave this showcase? Your progress on this round will be lost.")) {
      closeResultModal();
      renderHome();
      showScreen("screen-home");
    }
  });

  document.getElementById("guess-slider").addEventListener("input", (e) => {
    document.getElementById("guess-input").value = Number(e.target.value).toLocaleString();
    updateSliderFill(e.target);
  });
  document.getElementById("guess-input").addEventListener("input", (e) => {
    const n = parseInt(reformatGuessInput(e.target), 10);
    const slider = document.getElementById("guess-slider");
    if (!isNaN(n)) {
      slider.value = Math.max(parseInt(slider.min, 10), Math.min(n, parseInt(slider.max, 10)));
      updateSliderFill(slider);
    }
  });

  document.getElementById("btn-hint").addEventListener("click", useHint);

  document.getElementById("btn-submit-guess").addEventListener("click", submitGuess);
  document.getElementById("btn-next-round").addEventListener("click", nextRound);
  document.getElementById("btn-play-again").addEventListener("click", () => startGame(state.isDaily));
  document.getElementById("btn-share").addEventListener("click", shareResult);
}

/* -------------------------------- init ---------------------------------*/
(function init() {
  loadSave();
  checkUnlockRedirect();
  wireEvents();
  renderHome();
  showScreen("screen-home");
})();
