#!/usr/bin/env node
/**
 * setup-streetview.js
 * -----------------------------------------------------------------------
 * Wires your Google Maps keys into the game so you don't have to edit
 * files, run git, or click through GitHub's settings by hand.
 *
 *   npm run setup:streetview
 *
 * What it does:
 *   1. Asks for your browser key and writes it into config.js.
 *   2. Asks for your server key, checks it actually works, and stores it
 *      as a GitHub Actions secret via the `gh` CLI.
 *   3. Offers to commit and push config.js so the live site picks it up.
 *
 * What it deliberately does NOT do: print your keys, write them to a log,
 * or put the server key anywhere inside the repo. The server key goes
 * straight from your keyboard into GitHub's encrypted secret store. The
 * browser key does go into config.js and is served publicly — that is by
 * design, and its website restriction is what keeps it safe. README step
 * 3b explains why.
 *
 * You can re-run this safely; it overwrites rather than duplicating.
 * -----------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execFileSync } = require("child_process");
const { Writable } = require("stream");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "config.js");

const ESC = String.fromCharCode(27);
const style = (code, s) => `${ESC}[${code}m${s}${ESC}[0m`;
const bold = s => style("1", s);
const dim = s => style("2", s);
const green = s => style("32", s);
const yellow = s => style("33", s);
const red = s => style("31", s);

/* ------------------------------------------------------------------ *
 * Asking questions
 *
 * Two paths, because they behave very differently:
 *
 *   A real terminal  - one long-lived readline interface whose echo goes
 *                      through a stream we can mute, so typing a key shows
 *                      nothing. One interface for the whole run: creating
 *                      a fresh one per question closes stdin behind it and
 *                      every later question reads EOF.
 *
 *   Piped input      - readline with terminal:true swallows the entire
 *                      buffer on the first read, so later questions get
 *                      nothing. Read stdin once up front and serve answers
 *                      from a queue instead. This also makes the script
 *                      scriptable and testable.
 * ------------------------------------------------------------------ */

const isTTY = Boolean(process.stdin.isTTY);

let pipedLines = null;
function nextPipedLine() {
  if (pipedLines === null) {
    let raw = "";
    try {
      raw = fs.readFileSync(0, "utf8");
    } catch (e) {
      raw = "";
    }
    pipedLines = raw.split(/\r?\n/);
  }
  const line = pipedLines.shift();
  return (line === undefined ? "" : line).trim();
}

let output = null;
let rl = null;

function ensureReadline() {
  if (rl) return rl;
  output = new Writable({
    write(chunk, encoding, callback) {
      if (!output.muted) process.stdout.write(chunk, encoding);
      callback();
    }
  });
  output.muted = false;
  rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  rl.on("SIGINT", () => {
    output.muted = false;
    process.stdout.write("\n");
    process.exit(130);
  });
  return rl;
}

function closeReadline() {
  if (rl) {
    if (output) output.muted = false;
    rl.close();
    rl = null;
  }
}

/** Ask a normal, visible question. */
function askLine(question) {
  if (!isTTY) {
    const answer = nextPipedLine();
    process.stdout.write(question + answer + "\n");
    return Promise.resolve(answer);
  }
  return new Promise(resolve => {
    const iface = ensureReadline();
    output.muted = false;
    iface.question(question, answer => resolve(answer.trim()));
  });
}

/** Ask for something secret, echoing nothing as it's typed. */
function askSecret(question) {
  if (!isTTY) {
    const answer = nextPipedLine();
    process.stdout.write(question + "\n");
    return Promise.resolve(answer);
  }
  return new Promise(resolve => {
    const iface = ensureReadline();
    // Write the prompt straight to stdout so it survives the muting below.
    process.stdout.write(question);
    output.muted = true;
    iface.question("", answer => {
      output.muted = false;
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

function looksLikeGoogleKey(key) {
  // Google Maps keys are ~39 characters and begin "AIza". Not a guarantee,
  // but it catches the usual paste mistakes: a whole URL, a truncated key,
  // or the project ID pasted instead of the key.
  return /^AIza[0-9A-Za-z_-]{30,}$/.test(key);
}

/** Does this key work, and is the Street View Static API enabled on it? */
async function checkServerKey(key) {
  const url = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  // Somewhere guaranteed to have coverage, so a ZERO_RESULTS answer here
  // means the key is the problem rather than the address. Metadata lookups
  // are free, so this check costs nothing.
  url.searchParams.set("location", "38.897675,-77.036547");
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url);
    const body = await res.json();
    if (body.status === "OK") return { ok: true };
    return { ok: false, why: `${body.status}${body.error_message ? ": " + body.error_message : ""}` };
  } catch (e) {
    return { ok: false, why: `could not reach Google (${e.message})` };
  }
}

function haveGhCli() {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

async function setupBrowserKey() {
  console.log(bold("1. Browser key") + dim("  — goes in config.js, restricted to your website"));
  const key = await askSecret("   Paste it (nothing will appear), or press Enter to skip: ");

  if (!key) {
    console.log(dim("   Skipped."));
    return false;
  }
  if (!looksLikeGoogleKey(key)) {
    console.log(red("   That doesn't look like a Google Maps key — they start with AIza."));
    console.log(red("   Nothing was changed. Re-run when you have the right value."));
    return false;
  }

  const config = fs.readFileSync(CONFIG_PATH, "utf8");
  const updated = config.replace(/(googleMapsBrowserKey:\s*")[^"]*(")/, (m, a, b) => a + key + b);
  if (updated === config) {
    console.log(red("   Couldn't find googleMapsBrowserKey in config.js — was it hand-edited?"));
    return false;
  }

  fs.writeFileSync(CONFIG_PATH, updated);
  console.log(green("   Written into config.js") + dim("  (public by design — see README step 3b)"));
  return true;
}

async function setupServerKey() {
  console.log("\n" + bold("2. Server key") + dim("  — a GitHub Actions secret, never public"));
  const key = await askSecret("   Paste it (nothing will appear), or press Enter to skip: ");

  if (!key) {
    console.log(dim("   Skipped. Listings will use aerial photos until this is set."));
    return;
  }
  if (!looksLikeGoogleKey(key)) {
    console.log(red("   That doesn't look like a Google Maps key. Skipping it."));
    return;
  }

  process.stdout.write("   Checking it against Google... ");
  const check = await checkServerKey(key);
  if (check.ok) {
    console.log(green("works."));
  } else {
    console.log(red("rejected."));
    console.log(red(`   Google said: ${check.why}`));
    console.log(yellow("   Usual causes: the Street View Static API isn't enabled on this key, or"));
    console.log(yellow("   the key is restricted to a website (a server sends no referrer)."));
    const carryOn = await askLine("   Store it anyway? [y/N] ");
    if (!/^y/i.test(carryOn)) {
      console.log(dim("   Not stored."));
      return;
    }
  }

  if (!haveGhCli()) {
    console.log(yellow("   The `gh` CLI isn't available, so add the secret by hand:"));
    console.log(dim("   Settings > Secrets and variables > Actions > New repository secret"));
    console.log(dim("   Name it GOOGLE_MAPS_SERVER_KEY"));
    return;
  }

  try {
    execFileSync("gh", ["secret", "set", "GOOGLE_MAPS_SERVER_KEY"], {
      cwd: ROOT,
      input: key,
      stdio: ["pipe", "ignore", "inherit"]
    });
    console.log(green("   Stored as the GOOGLE_MAPS_SERVER_KEY repo secret"));
  } catch (e) {
    console.log(red("   `gh` couldn't set the secret. Add it by hand:"));
    console.log(dim("   Settings > Secrets and variables > Actions > New repository secret"));
  }
}

async function publish() {
  console.log("\n" + bold("3. Publish"));
  const answer = await askLine("   Commit and push config.js now? [Y/n] ");
  if (answer !== "" && !/^y/i.test(answer)) {
    console.log(dim("   Left uncommitted. Push config.js whenever you're ready."));
    return;
  }
  try {
    execFileSync("git", ["add", "config.js"], { cwd: ROOT, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "Add Google Maps browser key for street views"], {
      cwd: ROOT, stdio: "ignore"
    });
    execFileSync("git", ["push"], { cwd: ROOT, stdio: "inherit" });
    console.log(green("   Pushed. GitHub Pages redeploys in a minute or so."));
  } catch (e) {
    console.log(red("   git failed — commit and push config.js yourself."));
  }
}

async function main() {
  console.log("\n" + bold("Price the Property - Street View setup"));
  console.log(dim("Create the two keys first: see README step 3b.\n"));

  const browserKeySet = await setupBrowserKey();
  await setupServerKey();
  if (browserKeySet) await publish();

  console.log("\n" + bold("Next:"));
  console.log("  - Play at https://adthocro123.github.io/Price-the-Property/");
  console.log("  - Run the " + bold("Refresh property listings") + " workflow for exact camera angles");
  console.log(dim("    (Actions tab > Refresh property listings > Run workflow)\n"));

  closeReadline();
}

main().catch(err => {
  console.error(red("\nSetup failed: " + err.message));
  closeReadline();
  process.exit(1);
});
