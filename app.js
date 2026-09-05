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
      free: true, maxGuess: 1200000
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
    car: {
      key: "car", name: "Car Expansion", emoji: "🚗",
      file: "data/vehicles-car.json", itemsKey: "vehicles", type: "vehicle",
      free: false, price: "$4.99 one-time", maxGuess: 100000,
      stripeLink: "https://buy.stripe.com/REPLACE_CAR",
      desc: "Guess the price of real used cars & trucks"
    }
  },
  subscription: {
    key: "pro", name: "Property Pro Monthly", emoji: "👑",
    price: "$3.99/mo", desc: "Unlocks every expansion + a daily coin bonus",
    stripeLink: "https://buy.stripe.com/REPLACE_PRO"
  }
};

const SAVE_KEY = "ptp_save_v1";

let state = {
  coins: 0,
  streak: 0,
  bestScore: 0,
  unlocked: { mansion: false, hawaii: false, car: false, pro: false },
  selectedPack: "standard",
  roundIndex: 0,
  roundItems: [],
  showcaseScore: 0,
  showcaseGrid: [],
  isDaily: false,
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
      state.unlocked = Object.assign({ mansion: false, hawaii: false, car: false, pro: false }, parsed.unlocked || {});
    }
  } catch (e) { /* ignore corrupt save */ }
}
function persistSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      coins: state.coins, streak: state.streak, bestScore: state.bestScore, unlocked: state.unlocked
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
  window.scrollTo(0, 0);
}

/* ------------------------------- data ----------------------------------*/
async function fetchPackData(key) {
  if (state.dataCache[key]) return state.dataCache[key];
  const pack = CONFIG.packs[key];
  const res = await fetch(pack.file);
  const json = await res.json();
  const items = json[pack.itemsKey] || [];
  state.dataCache[key] = items;
  return items;
}

/* ---------------------------- home screen ------------------------------*/
function renderHome() {
  document.getElementById("stat-coins").textContent = state.coins;
  document.getElementById("stat-streak").textContent = state.streak;
  document.getElementById("stat-best").textContent = state.bestScore;

  const grid = document.getElementById("pack-grid");
  grid.innerHTML = "";
  Object.values(CONFIG.packs).forEach(pack => {
    const unlocked = isPackUnlocked(pack.key);
    const tile = document.createElement("div");
    tile.className = "pack-tile" + (state.selectedPack === pack.key ? " selected" : "") + (!unlocked ? " locked" : "");
    tile.innerHTML = `
      ${!unlocked ? `<span class="pack-lock-chip">🔒 ${pack.price || ""}</span>` : ""}
      <div class="pack-tile-emoji">${pack.emoji}</div>
      <div class="pack-tile-name">${pack.name}</div>
      <div class="pack-tile-sub">${unlocked ? "Tap to select" : "Unlock in store"}</div>
    `;
    tile.addEventListener("click", () => {
      if (!unlocked) { showScreen("screen-store"); renderStore(); return; }
      state.selectedPack = pack.key;
      renderHome();
    });
    grid.appendChild(tile);
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
      row.querySelector("button").addEventListener("click", () => goToCheckout(pack.stripeLink, pack.name));
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
    subRow.querySelector("button").addEventListener("click", () => goToCheckout(sub.stripeLink, sub.name));
  }
  list.appendChild(subRow);
}

function goToCheckout(link, name) {
  if (!link || link.includes("REPLACE")) {
    showToast(`⚠️ Add a real Stripe Payment Link for "${name}" in app.js CONFIG first.`);
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
    showToast("Couldn't load properties — check your connection and try again.");
    return;
  }

  state.roundItems = pool;
  showScreen("screen-game");
  loadRound();
}

function currentRound() { return state.roundItems[state.roundIndex]; }

function loadRound() {
  const round = currentRound();
  const pack = CONFIG.packs[round.packKey];
  const item = round.item;

  document.getElementById("round-indicator").textContent =
    (state.isDaily ? "Daily • " : "") + `Round ${state.roundIndex + 1} / ${state.roundItems.length}`;
  document.getElementById("game-coins").textContent = state.coins;
  document.getElementById("game-streak").textContent = state.streak;

  const imgEl = document.getElementById("property-image");
  imgEl.alt = item.title;
  imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#f2e6da"/><text x="450" y="300" font-family="sans-serif" font-size="28" fill="#c9a98a" text-anchor="middle">Photo unavailable</text></svg>'
  ); };
  imgEl.src = item.image;
  document.getElementById("property-pack-badge").textContent = pack.emoji + " " + pack.name;
  document.getElementById("property-title").textContent = item.title;

  const chipsWrap = document.getElementById("detail-chips");
  chipsWrap.innerHTML = "";
  let chips, subtitle;
  if (pack.type === "vehicle") {
    subtitle = `${item.year} • ${item.condition}`;
    chips = [item.make, item.model, `${item.mileage.toLocaleString()} mi`];
  } else {
    subtitle = `${item.city}, ${item.state}`;
    chips = [`${item.beds} bd`, `${item.baths} ba`, `${item.sqft.toLocaleString()} sqft`, `Built ${item.yearBuilt}`, `${item.lotSizeAcres} ac lot`];
  }
  document.getElementById("property-address").textContent = subtitle;
  chips.forEach(c => {
    const span = document.createElement("span");
    span.className = "detail-chip";
    span.textContent = c;
    chipsWrap.appendChild(span);
  });

  const slider = document.getElementById("guess-slider");
  slider.max = pack.maxGuess;
  slider.step = pack.maxGuess > 2000000 ? 10000 : (pack.maxGuess > 200000 ? 1000 : 250);
  slider.value = Math.round(pack.maxGuess / 2);
  document.getElementById("guess-input").value = "";
}

function currentGuessValue() {
  const raw = document.getElementById("guess-input").value;
  const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? parseInt(document.getElementById("guess-slider").value, 10) : n;
}

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
  const coinsEarned = Math.round(pts / 20) + (state.streak > 0 && state.streak % 3 === 0 ? 15 : 0);
  state.coins += coinsEarned;
  state.showcaseScore += pts;

  let gridEmoji = "🟥";
  if (!over) {
    if (pts >= 900) gridEmoji = "🟩";
    else if (pts >= 500) gridEmoji = "🟨";
    else gridEmoji = "🟧";
  }
  state.showcaseGrid.push(gridEmoji);
  persistSave();

  document.getElementById("result-badge").textContent = over ? "😬" : (pts >= 900 ? "🎯" : pts >= 500 ? "🎉" : "👍");
  document.getElementById("result-heading").textContent = over
    ? "Over budget!"
    : (pts >= 900 ? "Incredible guess!" : pts >= 500 ? "Nice guess!" : "Not bad!");
  document.getElementById("result-subtext").textContent = over
    ? "You went over — that's $0 for this one."
    : `You were within ${Math.round(Math.abs(actual - guess) / actual * 100)}% of the actual price.`;
  document.getElementById("result-your-guess").textContent = "$" + guess.toLocaleString();
  document.getElementById("result-actual-price").textContent = "$" + actual.toLocaleString();
  document.getElementById("result-points").textContent = pts;
  document.getElementById("result-coins").textContent = coinsEarned;

  if (navigator.vibrate) navigator.vibrate(over ? 80 : [40, 30, 40]);
  showScreen("screen-result");
}

function nextRound() {
  state.roundIndex += 1;
  if (state.roundIndex >= state.roundItems.length) {
    showSummary();
  } else {
    loadRound();
    showScreen("screen-game");
  }
}

function showSummary() {
  const isNewBest = state.showcaseScore > state.bestScore;
  if (isNewBest) state.bestScore = state.showcaseScore;
  persistSave();

  document.getElementById("summary-emoji").textContent = isNewBest ? "🏆" : "🏡";
  document.getElementById("summary-heading").textContent = state.isDaily ? "Daily Challenge Complete!" : "Showcase Complete!";
  document.getElementById("summary-score").textContent = state.showcaseScore + " pts";
  document.getElementById("summary-subtext").textContent = isNewBest
    ? "🎉 New personal best!"
    : `Personal best: ${state.bestScore} pts`;

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

  document.getElementById("btn-game-exit").addEventListener("click", () => {
    if (confirm("Leave this showcase? Your progress on this round will be lost.")) {
      renderHome();
      showScreen("screen-home");
    }
  });

  document.getElementById("guess-slider").addEventListener("input", (e) => {
    document.getElementById("guess-input").value = e.target.value;
  });
  document.getElementById("guess-input").addEventListener("input", (e) => {
    const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n)) document.getElementById("guess-slider").value = Math.min(n, parseInt(document.getElementById("guess-slider").max, 10));
  });

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
